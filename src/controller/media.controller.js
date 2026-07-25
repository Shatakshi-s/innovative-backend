import validateSession from "../utils/validateSession.controller";

// Helper function to validate YouTube URLs
function isValidYouTubeUrl(url) {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
    return youtubeRegex.test(url);
}

// Helper function to validate image files
function isValidImageFile(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    return allowedTypes.includes(file.type) && file.size <= maxSize;
}

// Helper function to normalize media type
function normalizeMediaType(type) {
    if (!type) return null;
    return type.toLowerCase().trim();
}

async function createMedia(request, dbClient, env) {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }

    try {
        const formData = await request.formData();
        const type = normalizeMediaType(formData.get('type')); // Normalize the type
        const title = formData.get('title');
        const description = formData.get('description');
        const file_data = formData.getAll('file_data');
        const urls = formData.getAll('urls');
        const visible = formData.get('visible') === 'true';

        if (!type || !title) {
            return new Response(JSON.stringify({ error: "Missing required fields: type and title" }), { status: 400 });
        }

        if (type !== 'image' && type !== 'youtube') {
            return new Response(JSON.stringify({ error: "Invalid media type. Must be 'image' or 'youtube'" }), { status: 400 });
        }

        let mediaUrls = [];

        if (type === 'image') {
            // For image type, we need at least one file
            if (file_data.length === 0) {
                return new Response(JSON.stringify({ error: "At least one image file is required for type 'image'" }), { status: 400 });
            }

            // Validate all files before uploading
            for (const file of file_data) {
                if (file && file.size > 0 && !isValidImageFile(file)) {
                    return new Response(JSON.stringify({ 
                        error: "Invalid file type or size. Only images (JPEG, PNG, GIF, WebP) up to 10MB are allowed." 
                    }), { status: 400 });
                }
            }

            // Handle file uploads for photos
            for (const file of file_data) {
                if (file && file.size > 0) {
                    try {
                        const fileName = `${Date.now()}-${file.name}`;
                        await env.KRISHI_BUCKET.put(fileName, file.stream(), {
                            httpMetadata: { contentType: file.type },
                        });
                        mediaUrls.push(`${env.R2_PUBLIC_URL}/${fileName}`);
                    } catch (error) {
                        console.error("R2 upload error:", error);
                        return new Response(JSON.stringify({ error: "File upload to R2 failed" }), { status: 500 });
                    }
                }
            }
        } else if (type === 'youtube') {
            // For youtube type, we need exactly one URL
            if (urls.length !== 1) {
                return new Response(JSON.stringify({ error: "Exactly one YouTube URL is required for type 'youtube'" }), { status: 400 });
            }
            mediaUrls = urls;
        }

        const query = `
            INSERT INTO media (type, urls, title, description, visible)
            VALUES (?, ?, ?, ?, ?)
            RETURNING id;
        `;

        const result = await dbClient.execute(query, [
            type,
            JSON.stringify(mediaUrls),
            title,
            description || null,
            visible
        ]);
        const mediaId = result.rows[0].id;

        return new Response(JSON.stringify({ message: "Media created successfully", mediaId }), { status: 201 });

    } catch (error) {
        console.error("Database error:", error);
        return new Response(JSON.stringify({ error: "Failed to create media", details: error.message }), { status: 500 });
    }
}

async function getMedia(request, dbClient, env) {
    try {
        const authenticationResponse = await validateSession(request, env);
        const isAuthenticated = authenticationResponse.status;

        let query = `
            SELECT id, type, urls, title, description, created_at, visible
            FROM media
        `;

        if (!isAuthenticated) {
            query += ` WHERE visible = 1`;
        }

        query += ` ORDER BY created_at DESC`;

        const result = await dbClient.execute(query);
        const media = result.rows.map(row => {
            try {
                return {
                    ...row,
                    urls: JSON.parse(row.urls || '[]')
                };
            } catch (parseError) {
                console.error("Error parsing URLs:", parseError);
                return {
                    ...row,
                    urls: []
                };
            }
        });

        return new Response(JSON.stringify({ message: "Media fetched successfully", media }), { status: 200 });

    } catch (error) {
        console.error("Database error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch media", details: error.message }), { status: 500 });
    }
}

async function editMedia(request, dbClient, mediaId, env) {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }

    try {
        const formData = await request.formData();
        const type = normalizeMediaType(formData.get('type')); // Normalize the type
        const title = formData.get('title');
        const description = formData.get('description');
        const file_data = formData.getAll('file_data');
        const urls = formData.getAll('urls');
        const visible = formData.get('visible') === 'true';
        const removeUrls = formData.getAll('remove_urls');
        const removeFiles = formData.getAll('remove_files');

        if (type !== 'image' && type !== 'youtube') {
            return new Response(JSON.stringify({ error: "Invalid media type. Must be 'image' or 'youtube'" }), { status: 400 });
        }

        // Get existing media data
        const existingMediaQuery = `SELECT type, urls FROM media WHERE id = ?`;
        const existingMediaResult = await dbClient.execute(existingMediaQuery, [mediaId]);

        if (!existingMediaResult.rows || existingMediaResult.rows.length === 0) {
            return new Response(JSON.stringify({ error: "Media not found" }), { status: 404 });
        }

        const existingType = existingMediaResult.rows[0].type;
        let existingUrls;
        try {
            existingUrls = JSON.parse(existingMediaResult.rows[0].urls || '[]');
        } catch (parseError) {
            console.error("Error parsing existing URLs:", parseError);
            existingUrls = [];
        }

        let newUrls = [];

        if (type === 'image') {
            // For image type, validate new files
            for (const file of file_data) {
                if (file && file.size > 0 && !isValidImageFile(file)) {
                    return new Response(JSON.stringify({ 
                        error: "Invalid file type or size. Only images (JPEG, PNG, GIF, WebP) up to 10MB are allowed." 
                    }), { status: 400 });
                }
            }

            // Handle file deletions
            for (const url of removeFiles) {
                try {
                    const fileName = url.split('/').pop();
                    await env.KRISHI_BUCKET.delete(fileName);
                    existingUrls = existingUrls.filter(u => u !== url);
                } catch (error) {
                    console.error("R2 delete error:", error);
                    return new Response(JSON.stringify({ error: "File delete from R2 failed" }), { status: 500 });
                }
            }

            // Handle new file uploads
            for (const file of file_data) {
                if (file && file.size > 0) {
                    try {
                        const fileName = `${Date.now()}-${file.name}`;
                        await env.KRISHI_BUCKET.put(fileName, file.stream(), {
                            httpMetadata: { contentType: file.type },
                        });
                        newUrls.push(`${env.R2_PUBLIC_URL}/${fileName}`);
                    } catch (error) {
                        console.error("R2 upload error:", error);
                        return new Response(JSON.stringify({ error: "File upload to R2 failed" }), { status: 500 });
                    }
                }
            }
        } else if (type === 'youtube') {
            // For youtube type, we need exactly one URL
            if (urls.length !== 1) {
                return new Response(JSON.stringify({ error: "Exactly one YouTube URL is required for type 'youtube'" }), { status: 400 });
            }
            newUrls = urls;
        }

        // Combine existing and new URLs
        const allUrls = type === 'youtube' ? newUrls : [...existingUrls, ...newUrls];

        const query = `
            UPDATE media
            SET type = ?, urls = ?, title = ?, description = ?, visible = ?
            WHERE id = ?;
        `;

        await dbClient.execute(query, [
            type,
            JSON.stringify(allUrls),
            title,
            description || null,
            visible,
            mediaId
        ]);

        return new Response(JSON.stringify({ 
            message: "Media updated successfully",
            media: {
                id: mediaId,
                type,
                urls: allUrls,
                title,
                description,
                visible
            }
        }), { status: 200 });

    } catch (error) {
        console.error("Database error:", error);
        return new Response(JSON.stringify({ error: "Failed to edit media", details: error.message }), { status: 500 });
    }
}

async function deleteMedia(request, dbClient, mediaId, env) {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }

    try {
        // Get media data before deletion
        const getMediaQuery = `SELECT type, urls FROM media WHERE id = ?`;
        const mediaResult = await dbClient.execute(getMediaQuery, [mediaId]);

        if (mediaResult.rows.length === 0) {
            return new Response(JSON.stringify({ error: "Media not found" }), { status: 404 });
        }

        let urls;
        try {
            urls = JSON.parse(mediaResult.rows[0].urls || '[]');
        } catch (parseError) {
            console.error("Error parsing URLs:", parseError);
            urls = [];
        }

        // Delete all files from R2 if it's an image type
        if (mediaResult.rows[0].type === 'image') {
            const deletePromises = urls.map(async (url) => {
                if (url.startsWith(env.R2_PUBLIC_URL)) {
                    const fileName = url.split('/').pop();
                    try {
                        await env.KRISHI_BUCKET.delete(fileName);
                    } catch (error) {
                        console.error(`Error deleting file ${fileName}:`, error);
                    }
                }
            });
            await Promise.all(deletePromises);
        }

        const query = `DELETE FROM media WHERE id = ?`;
        await dbClient.execute(query, [mediaId]);

        return new Response(JSON.stringify({ message: "Media deleted successfully" }), { status: 200 });

    } catch (error) {
        console.error("Database error:", error);
        return new Response(JSON.stringify({ error: "Failed to delete media", details: error.message }), { status: 500 });
    }
}

module.exports = { createMedia, getMedia, editMedia, deleteMedia }; 