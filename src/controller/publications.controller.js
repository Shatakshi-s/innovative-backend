import validateSession from "../utils/validateSession.controller";

async function createPublication(request, dbClient, env) {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }

    try {
        const formData = await request.formData();
        const title = formData.get('title');
        const description = formData.get('description');
        const type = formData.get('type');
        const file_data = formData.get('file_data');
        const published_date = formData.get('published_date');
        const alt_text = formData.get('alt_text');

        if (!title || !type || !file_data) {
            return new Response(JSON.stringify({ error: "Missing required fields: title, type, and file." }), { status: 400 });
        }

        let fileName = null;

        if (file_data && file_data.size > 0) {
            try {
                fileName = `${Date.now()}-${file_data.name}`;
                await env.KRISHI_BUCKET.put(fileName, file_data.stream(), {
                    httpMetadata: { contentType: file_data.type, alt: alt_text || '' },
                });
            } catch (error) {
                console.error("R2 upload error:", error);
                return new Response(JSON.stringify({ error: "File upload to R2 failed" }), { status: 500 });
            }
        }

        const query = `
            INSERT INTO Publications (title, description, type, file_name, published_date, alt_text, active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            RETURNING publication_id;
        `;

        const result = await dbClient.execute(query, [title, description || null, type, fileName, published_date || null, alt_text || null]);
        const publication_id = result.rows[0].publication_id;

        return new Response(JSON.stringify({ message: "Publication created successfully", publication_id }), { status: 201 });

    } catch (error) {
        console.error("Database error:", error);
        return new Response(JSON.stringify({ error: "Failed to create publication", details: error.message }), { status: 500 });
    }
}

async function editPublication(request, dbClient, publication_id, env) {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }

    try {
        const formData = await request.formData();
        const title = formData.get('title');
        const description = formData.get('description');
        const type = formData.get('type');
        const file_data = formData.get('file_data');
        const published_date = formData.get('published_date');
        const alt_text = formData.get('alt_text');
        const deleteFile = formData.get('deleteFile') === 'true';

        // Get existing data for the publication
        const existingPublicationQuery = `SELECT file_name FROM Publications WHERE publication_id = ?`;
        const existingPublicationResult = await dbClient.execute(existingPublicationQuery, [publication_id]);

        if (!existingPublicationResult.rows || existingPublicationResult.rows.length === 0) {
            return new Response(JSON.stringify({ error: "Publication not found" }), { status: 404 });
        }

        let fileName = existingPublicationResult.rows[0].file_name;

        // Handle file deletion
        if (deleteFile && fileName) {
            try {
                await env.KRISHI_BUCKET.delete(fileName);
                fileName = null;
            } catch (error) {
                console.error("R2 delete error:", error);
                return new Response(JSON.stringify({ error: "File delete from R2 failed" }), { status: 500 });
            }
        }
        if (file_data && file_data.size > 0) {
            try {
                fileName = `${Date.now()}-${file_data.name}`;
                await env.KRISHI_BUCKET.put(fileName, file_data.stream(), {
                    httpMetadata: { contentType: file_data.type, alt: alt_text || '' },
                });
            } catch (error) {
                console.error("R2 upload error:", error);
                return new Response(JSON.stringify({ error: "File upload to R2 failed" }), { status: 500 });
            }
        }

        const query = `
            UPDATE Publications
            SET title = ?, description = ?, type = ?, file_name = ?, published_date = ?, alt_text = ?
            WHERE publication_id = ?;
        `;

        await dbClient.execute(query, [title, description || null, type, fileName, published_date || null, alt_text || null, publication_id]);

        return new Response(JSON.stringify({ message: "Publication updated successfully" }), { status: 200 });

    } catch (error) {
        console.error("Database error:", error);
        return new Response(JSON.stringify({ error: "Failed to edit publication", details: error.message }), { status: 500 });
    }
}

async function deletePublication(request, dbClient, publication_id, env) {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }

    try {
        const getPublicationQuery = `SELECT file_name FROM Publications WHERE publication_id = ?`;
        const publicationResult = await dbClient.execute(getPublicationQuery, [publication_id]);

        if (publicationResult.rows.length === 0) {
            return new Response(JSON.stringify({ error: "Publication not found" }), { status: 404 });
        }

        const fileName = publicationResult.rows[0].file_name;

        if (fileName) {
            await env.KRISHI_BUCKET.delete(fileName);
        }

        const query = `DELETE FROM Publications WHERE publication_id = ?`;
        await dbClient.execute(query, [publication_id]);

        return new Response(JSON.stringify({ message: "Publication deleted successfully" }), { status: 200 });

    } catch (error) {
        console.error("Database error:", error);
        return new Response(JSON.stringify({ error: "Failed to delete publication", details: error.message }), { status: 500 });
    }
}

async function getPublications(request, dbClient, env) {
    try {
        const authenticationResponse = await validateSession(request, env);
        const isAuthenticated = authenticationResponse.status;

        let query = `
            SELECT publication_id, title, description, type, file_name, alt_text, published_date, active
            FROM Publications
        `;

        if (!isAuthenticated) {
            query += ` WHERE active = 1`;
        }

        query += ` ORDER BY published_date DESC`;

        const result = await dbClient.execute(query);

        const publications = result.rows.map(row => ({
            ...row,
            file_url: `${env.R2_PUBLIC_URL}/${row.file_name}`,
        }));

        // Group the publications by type
        const groupedPublications = publications.reduce((acc, publication) => {
            if (!acc[publication.type]) {
                acc[publication.type] = [];
            }
            acc[publication.type].push(publication);
            return acc;
        }, {});

        return new Response(JSON.stringify({ message: "Publications fetched successfully", publications: groupedPublications }), { status: 200 });

    } catch (error) {
        console.error("Database error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch publications", details: error.message }), { status: 500 });
    }
}

async function setPublicationActiveStatus(request, dbClient, publication_id, env) {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }

    try {
        const { active } = await request.json();

        if (typeof active !== 'boolean') {
            return new Response(JSON.stringify({ error: "Invalid 'active' value. Must be a boolean." }), { status: 400 });
        }

        let query;
        let params = [active ? 1 : 0, publication_id];

        // If activating AND published_date is NULL, set published_date to now
        if (active) {
            query = `
                UPDATE Publications
                SET active = ?, published_date = CASE WHEN published_date IS NULL THEN CURRENT_TIMESTAMP ELSE published_date END
                WHERE publication_id = ?
            `;
        } else {
            query = `
                UPDATE Publications
                SET active = ?
                WHERE publication_id = ?
            `;
        }

        await dbClient.execute(query, params);

        return new Response(JSON.stringify({ message: `Publication ${active ? 'activated' : 'deactivated'} successfully` }), { status: 200 });

    } catch (error) {
        console.error("Database error:", error);
        return new Response(JSON.stringify({ error: "Failed to update publication status", details: error.message }), { status: 500 });
    }
}

module.exports = { createPublication, getPublications, editPublication, deletePublication, setPublicationActiveStatus };