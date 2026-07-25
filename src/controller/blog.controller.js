import validateSession from "../utils/validateSession.controller";

/**
 * Utility function to generate a URL-friendly slug from a title.
 * @param {string} title - The title to convert to a slug.
 */
const createSlug = (title) => {
    if (!title) {
        throw new Error("Title is required to create a slug.");
    }

    return title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
};

/**
 * Utility function to parse a comma-separated list of image names.
 */
const parseImageList = (imageList) => {
    return imageList ? imageList.split(',').map(name => name.trim()) : [];
};

/**
 * Utility function to truncate text.
 */
const truncateText = (text, limit = 100) => {
    if (!text) return "";
    return text.length > limit ? text.substring(0, limit) + "..." : text;
};

/**
 * Public route to fetch published blog posts in truncated form.
 */
const getPublishedBlogs = async (dbClient, env, request) => {
    try {
        const url = new URL(request.url);
        const limit = parseInt(url.searchParams.get('limit') || '10', 10);
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);

        if (!dbClient || typeof dbClient.execute !== 'function') {
            throw new Error("dbClient is not a valid database client, check configuration and imports")
        }

        const query = `
            SELECT b.post_id, b.title, b.slug, b.excerpt, b.created_at,
                   b.featured_image_name AS thumbnail_image_name
            FROM BlogPosts b
            WHERE b.status = 'published'
            ORDER BY b.created_at DESC
            LIMIT ? OFFSET ?;
        `;

        const result = await dbClient.execute(query, [limit, offset]);

        const blogs = result.rows.map(row => ({
            post_id: row.post_id,
            title: row.title,
            slug: row.slug,
            excerpt: truncateText(row.excerpt, 150), // Truncate the excerpt
            created_at: row.created_at,
            thumbnail_image: row.thumbnail_image_name ? `${env.R2_PUBLIC_URL}/${row.thumbnail_image_name}` : null, // construct the url
        }));

        return new Response(JSON.stringify({
            message: "Published blog posts fetched successfully!",
            blogCount: blogs.length,
            blogs,
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Error fetching published blog posts:", error);
        return new Response(JSON.stringify({
            error: "Failed to fetch published blog posts",
            details: error.message
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

const getPublishedBlogById = async (id, dbClient, env) => {
    try {
        const postQuery = `
        SELECT b.*
        FROM BlogPosts b
        WHERE b.post_id = ? AND b.status = 'published';
        `;
        const result = await dbClient.execute(postQuery, [id]);

        if (result.rows.length === 0) {
            return new Response(JSON.stringify({
                error: "Blog post not found."
            }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
            });
        }

        const post = result.rows[0];

        // Replace featured_image_name with full URL
        const featuredImageUrl = post.featured_image_name
            ? `${env.R2_PUBLIC_URL}/${post.featured_image_name}`
            : null;

        // Replace extra_images_list with an array of URLs
        const extraImageUrls = post.extra_images_list
            ? post.extra_images_list
                .split(',')
                .map(name => `${env.R2_PUBLIC_URL}/${name.trim()}`)
            : [];

        return new Response(JSON.stringify({
            message: "Blog post fetched successfully!",
            post: {
                ...post,
                featured_image: featuredImageUrl,
                extra_images_list: extraImageUrls, // ✅ Now an array of URLs
            },
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });

    } catch (error) {
        return new Response(JSON.stringify({
            error: "Failed to fetch blog post",
            details: error.message
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};


/**
 * Fetch all blog posts along with their thumbnail and extra images.
 */
const getAllBlogs = async (dbClient, env) => {
    try {
        if (!dbClient || typeof dbClient.execute !== 'function') {
            throw new Error("dbClient is not a valid database client, check configuration and imports")
        }

        const query = `
            SELECT b.post_id, b.title, b.slug, b.excerpt, b.created_at, b.status,
                   b.featured_image_name AS thumbnail_image_name, b.extra_images_list
            FROM BlogPosts b
            ORDER BY b.created_at DESC;
        `;
        const result = await dbClient.execute(query);

        // Fetch extra images for each blog post
        const blogs = await Promise.all(result.rows.map(async (row) => {
            const extraImageNames = parseImageList(row.extra_images_list);

            // Fetch URLs for extra images from R2
            const extraImages = await Promise.all(extraImageNames.map(async (imageName) => {
                return {
                    image_name: imageName,
                    image_url: imageName ? `${env.R2_PUBLIC_URL}/${imageName}` : null, // Construct the URL
                };
            }));
            return {
                post_id: row.post_id,
                title: row.title,
                slug: row.slug,
                excerpt: row.excerpt,
                created_at: row.created_at,
                status: row.status,
                thumbnail_image: row.thumbnail_image_name ? `${env.R2_PUBLIC_URL}/${row.thumbnail_image_name}` : null, // construct the url
                extra_images: extraImages,
            };
        }));

        return new Response(JSON.stringify({
            message: "Blog posts fetched successfully!",
            blogCount: blogs.length,
            blogs,
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: "Failed to fetch blog posts",
            details: error.message
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

/**
 * Fetch a single blog post by ID along with its images.
 */
const getBlogById = async (id, dbClient, env) => {
    try {
        const postQuery = `
            SELECT b.*
            FROM BlogPosts b
            WHERE b.post_id = ?;
        `;
        const result = await dbClient.execute(postQuery, [id]);

        if (result.rows.length === 0) {
            return {
                status: 404,
                body: JSON.stringify({ error: "Blog post not found." }),
                headers: { "Content-Type": "application/json" },
            };
        }

        const post = result.rows[0];
        const extraImageNames = parseImageList(post.extra_images_list);

        // Fetch URLs for extra images from R2
        const extraImages = await Promise.all(extraImageNames.map(async (imageName) => {
            return {
                image_name: imageName,
                image_url: imageName ? `${env.R2_PUBLIC_URL}/${imageName}` : null, // Construct the URL
            };
        }));

        return {
            status: 200,
            body: JSON.stringify({
                message: "Blog post fetched successfully!",
                post: {
                    ...post,
                    featured_image: post.featured_image_name ? `${env.R2_PUBLIC_URL}/${post.featured_image_name}` : null, // Construct the URL
                    extra_images: extraImages,
                },
            }),
            headers: { "Content-Type": "application/json" },
        };
    } catch (error) {
        console.error("Error fetching blog post by ID:", error);
        return {
            status: 500,
            body: JSON.stringify({
                error: "Failed to fetch blog post",
                details: error.message
            }),
            headers: { "Content-Type": "application/json" },
        };
    }
};

/**
 * Create a new blog post with authorization, including extra images.
 */
const createBlog = async (request, dbClient, env) => {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }
    try {
        const formData = await request.formData();
        const title = formData.get("title");
        const status = formData.get('status');
        const image_data = formData.get('image_data');
        const alt_text = formData.get('alt_text');
        const extra_images_files = formData.getAll('extra_images');
        const author = authenticationResponse.user.id;
        const excerpt = formData.get('excerpt');
        const content = formData.get('content');
        const existing_image = formData.get("existing_image");

        let featuredImageName = null;
        const extraImageNames = [];

        if (!title || !content || !author) {
            return new Response(JSON.stringify({
                error: "Missing required fields: title, content, or author."
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        if (image_data && image_data.size > 0) {
            try {
                const imageName = `${Date.now()}-${image_data.name}`;
                await env.KRISHI_BUCKET.put(imageName, image_data.stream(), {
                    httpMetadata: { contentType: image_data.type, alt: alt_text || '' },
                });
                featuredImageName = imageName;
            } catch (error) {
                console.error("Featured image upload error:", error);
                return new Response(JSON.stringify({
                    error: "Featured image upload to R2 issue occurred within blog post.",
                    details: error.message,
                }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
        } else if (existing_image) {
            featuredImageName = existing_image
        }

        // Handle extra images upload
        for (const imageFile of extra_images_files) {
            if (imageFile instanceof File && imageFile.size > 0) {
                try {
                    const imageName = `${Date.now()}-${imageFile.name}`;
                    await env.KRISHI_BUCKET.put(imageName, imageFile.stream(), {
                        httpMetadata: { contentType: imageFile.type, alt: alt_text || '' },
                    });
                    extraImageNames.push(imageName);
                } catch (error) {
                    console.error("Extra image upload error:", error);
                    return new Response(JSON.stringify({
                        error: "An error occurred during extra image upload to R2.",
                        details: error.message,
                    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
                }
            }
        }

        const slug = createSlug(title);
        const extraImagesList = extraImageNames.length > 0 ? extraImageNames.join(',') : null;

        const query = `
            INSERT INTO BlogPosts (title, slug, content, excerpt, status, featured_image_name, extra_images_list, author_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await dbClient.execute(query, [
            title,
            slug,
            content,
            excerpt || null,
            status || 'draft',
            featuredImageName,
            extraImagesList,
            authenticationResponse.user.id,
        ]);

        return new Response(JSON.stringify({
            message: "Blog post created successfully!",
            slug,
        }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Failed to create blog post:", error);
        return new Response(JSON.stringify({
            error: "Failed to create blog post",
            details: error.message
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

/**
 * Update a blog post by ID with authorization, including extra images.
 */
const updateBlog = async (id, request, dbClient, env) => {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }

    const isAdmin = authenticationResponse.user.role === 'admin';

    try {
        const formData = await request.formData();
        const title = formData.get("title");
        const status = formData.get('status');
        const image_data = formData.get('image_data');
        const alt_text = formData.get('alt_text');
        const extra_images_files = formData.getAll('extra_images');
        const excerpt = formData.get('excerpt');
        const content = formData.get('content');
        const existing_image = formData.get("existing_image");
        const removedImageIndices = formData.getAll('removed_extra_image_indices').map(Number); //get removed indices

        let featuredImageName = null;
        let featuredImageChanged = false; // Flag to track if the featured image has been changed
        const newExtraImageNames = [];

        if (!title || !content) {
            return new Response(JSON.stringify({
                error: "Missing required fields: title or content."
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Handle featured image upload
        if (image_data && image_data.size > 0) {
            try {
                const imageName = `${Date.now()}-${image_data.name}`;
                await env.KRISHI_BUCKET.put(imageName, image_data.stream(), {
                    httpMetadata: { contentType: image_data.type, alt: alt_text || '' },
                });
                featuredImageName = imageName;
                featuredImageChanged = true;
            } catch (error) {
                console.error("Featured image upload error:", error);
                return new Response(JSON.stringify({
                    error: "Featured image upload to R2 issue occurred within blog post.",
                    details: error.message,
                }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
        } else if (existing_image) {
            featuredImageName = existing_image;
            featuredImageChanged = true;
        }

        // Handle extra images upload
        for (const imageFile of extra_images_files) {
            if (imageFile instanceof File && imageFile.size > 0) {
                try {
                    const imageName = `${Date.now()}-${imageFile.name}`;
                    await env.KRISHI_BUCKET.put(imageName, imageFile.stream(), {
                        httpMetadata: { contentType: imageFile.type, alt: alt_text || '' },
                    });
                    newExtraImageNames.push(imageName);
                } catch (error) {
                    console.error("Extra image upload error:", error);
                    return new Response(JSON.stringify({
                        error: "An error occurred during extra image upload to R2.",
                        details: error.message,
                    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
                }
            }
        }

        // Fetch the existing post data
        const existingPostResult = await getBlogById(id, dbClient, env);

        if (existingPostResult.status !== 200) {
            return new Response(existingPostResult.body, {
                status: existingPostResult.status,
                headers: existingPostResult.headers,
            });
        }

        const existingPost = JSON.parse(existingPostResult.body).post; // Parse the JSON body
        let existingExtraImageNames = parseImageList(existingPost.extra_images_list);

        // Remove extra images based on index (correctly handling index shifts)
        if (removedImageIndices.length > 0) {
            const imagesToDelete = [];
            // Sort indices in descending order to prevent issues with index shifting during deletion
            const sortedIndices = [...removedImageIndices].sort((a, b) => b - a);

            for (const index of sortedIndices) {
                if (index >= 0 && index < existingExtraImageNames.length) {
                    const imageName = existingExtraImageNames.splice(index, 1)[0]; // Remove and get the imageName
                    if (imageName) {
                        imagesToDelete.push(imageName);
                    }
                }
            }
            // Delete the removed images from R2
            await Promise.all(imagesToDelete.map(async (imageName) => {
                try {
                    await env.KRISHI_BUCKET.delete(imageName);
                } catch (deleteError) {
                    console.error(`Error deleting image ${imageName} from R2:`, deleteError);
                }
            }));
        }

        // Combine the existing and new extra image names
        const combinedExtraImageNames = [...existingExtraImageNames, ...newExtraImageNames];
        const extraImagesList = combinedExtraImageNames.length > 0 ? combinedExtraImageNames.join(',') : null;

        // Check if any data has been changed to avoid unnecessary database updates
        if (title === existingPost.title &&
            content === existingPost.content &&
            excerpt === existingPost.excerpt &&
            status === existingPost.status &&
            !featuredImageChanged && // Check if the featured image has been changed
            extraImagesList === existingPost.extra_images_list
        ) {
            return new Response(JSON.stringify({
                message: "No changes detected, blog post not updated.",
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        const query = `
            UPDATE BlogPosts
            SET title = ?, content = ?, excerpt = ?, status = ?, featured_image_name = ?, extra_images_list = ?, updated_at = CURRENT_TIMESTAMP
            WHERE post_id = ? ${isAdmin ? '' : 'AND author_id = ?'};
        `;
        const result = await dbClient.execute(query, [
            title,
            content,
            excerpt || null,
            status || 'draft',
            featuredImageName,
            extraImagesList,
            id,
            ...(isAdmin ? [] : [authenticationResponse.user.id]),
        ]);

        if (result.rowsAffected === 0) {
            return new Response(JSON.stringify({
                error: "Blog post not found or unauthorized to update."
            }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({
            message: "Blog post updated successfully!",
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Failed to update blog post:", error);
        return new Response(JSON.stringify({
            error: "Failed to update blog post",
            details: error.message
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

/**
 * Delete a blog post by ID with authorization.
 */
const deleteBlog = async (id, request, dbClient, env) => {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }

    const isAdmin = authenticationResponse.user.role === 'admin';

    try {
        // Before deleting the blog post, fetch the image names to delete from R2
        const postResult = await getBlogById(id, dbClient, env);

        if (postResult.status !== 200) {
            return new Response(postResult.body, {
                status: postResult.status,
                headers: postResult.headers,
            });
        }
        const post = JSON.parse(postResult.body).post; // Parse the JSON body

        if (post) {
            const imageNamesToDelete = [];
            if (post.featured_image_name) {
                imageNamesToDelete.push(post.featured_image_name);
            }
            if (post.extra_images_list) {
                imageNamesToDelete.push(...parseImageList(post.extra_images_list));
            }

            // Delete images from R2
            await Promise.all(imageNamesToDelete.map(async (imageName) => {
                if (imageName) {
                    try {
                        await env.KRISHI_BUCKET.delete(imageName);
                    } catch (deleteError) {
                        console.error(`Error deleting image ${imageName} from R2:`, deleteError);
                        // Optionally, decide whether to throw an error and halt the process or continue
                    }
                }
            }));
        }

        const query = `
            DELETE FROM BlogPosts
            WHERE post_id = ? ${isAdmin ? '' : 'AND author_id = ?'};
        `;
        const result = await dbClient.execute(query, [
            id,
            ...(isAdmin ? [] : [authenticationResponse.user.id]),
        ]);

        if (result.rowsAffected === 0) {
            return new Response(JSON.stringify({
                error: "Blog post not found or unauthorized to delete."
            }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({
            message: "Blog post deleted successfully!",
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Failed to delete blog post:", error);
        return new Response(JSON.stringify({
            error: "Failed to delete blog post",
            details: error.message
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

module.exports = { getAllBlogs, getBlogById, createBlog, updateBlog, deleteBlog, getPublishedBlogs, getPublishedBlogById };