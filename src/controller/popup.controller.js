import validateSession from "../utils/validateSession.controller";

async function createPopupMessage(request, dbClient, env) {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }

    try {
        const formData = await request.formData();
        const title = formData.get('title');
        const content = formData.get('content');
        const image_data = formData.get('image_data');
        const alt_text = formData.get('alt_text');
        const start_date = formData.get('start_date');
        const end_date = formData.get('end_date');

        const start_date_val = (start_date && start_date.trim() !== '') ? start_date : null;
        const end_date_val = (end_date && end_date.trim() !== '') ? end_date : null;

        if (!title || !content) {
            return new Response(JSON.stringify({ error: "Missing required fields: title and content" }), { status: 400 });
        }

        let imageName = null;

        if (image_data && image_data.size > 0) {
            try {
                imageName = `${Date.now()}-${image_data.name}`;
                await env.KRISHI_BUCKET.put(imageName, image_data.stream(), {
                    httpMetadata: { contentType: image_data.type, alt: alt_text || '' },
                });
            } catch (error) {
                console.error("R2 upload error:", error);
                return new Response(JSON.stringify({ error: "Image upload to R2 failed" }), { status: 500 });
            }
        }

        const query = `
            INSERT INTO PopupMessages (title, content, image_name, alt_text, start_date, end_date, active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            RETURNING popup_id;
        `;

        const result = await dbClient.execute(query, [title, content, imageName, alt_text || null, start_date_val, end_date_val]);
        const popup_id = result.rows[0].popup_id;

        return new Response(JSON.stringify({ message: "Popup message created successfully", popup_id }), { status: 201 });

    } catch (error) {
        console.error("Database error:", error);
        return new Response(JSON.stringify({ error: "Failed to create popup message", details: error.message }), { status: 500 });
    }
}

async function editPopupMessage(request, dbClient, popup_id, env) {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }

    try {
        const formData = await request.formData();
        const title = formData.get('title');
        const content = formData.get('content');
        const image_data = formData.get('image_data');
        const alt_text = formData.get('alt_text');
        const start_date = formData.get('start_date');
        const end_date = formData.get('end_date');
        const deleteImage = formData.get('deleteImage') === 'true';

        const start_date_val = (start_date && start_date.trim() !== '') ? start_date : null;
        const end_date_val = (end_date && end_date.trim() !== '') ? end_date : null;

        // Get existing data for the blog post
        const existingPopupQuery = `SELECT image_name FROM PopupMessages WHERE popup_id = ?`;
        const existingPopupResult = await dbClient.execute(existingPopupQuery, [popup_id]);

        if (!existingPopupResult.rows || existingPopupResult.rows.length === 0) {
            return new Response(JSON.stringify({ error: "Popup message not found" }), { status: 404 });
        }
        let imageName = existingPopupResult.rows[0].image_name;


        if (deleteImage && imageName) {
            try {
                await env.KRISHI_BUCKET.delete(imageName);
                imageName = null;
            } catch (error) {
                console.error("R2 delete error:", error);
                return new Response(JSON.stringify({ error: "Image delete from R2 failed" }), { status: 500 });
            }
        }

        if (image_data && image_data.size > 0) {
            try {
                imageName = `${Date.now()}-${image_data.name}`;
                await env.KRISHI_BUCKET.put(imageName, image_data.stream(), {
                    httpMetadata: { contentType: image_data.type, alt: alt_text || '' },
                });
            } catch (error) {
                console.error("R2 upload error:", error);
                return new Response(JSON.stringify({ error: "Image upload to R2 failed" }), { status: 500 });
            }
        }


        const query = `
            UPDATE PopupMessages
            SET title = ?, content = ?, image_name = ?, alt_text = ?, start_date = ?, end_date = ?
            WHERE popup_id = ?;
        `;

        await dbClient.execute(query, [title, content, imageName, alt_text || null, start_date_val, end_date_val, popup_id]);

        return new Response(JSON.stringify({ message: "Popup message updated successfully" }), { status: 200 });

    } catch (error) {
        console.error("Database error:", error);
        return new Response(JSON.stringify({ error: "Failed to edit popup message", details: error.message }), { status: 500 });
    }
}

async function deletePopupMessage(request, dbClient, popup_id, env) {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }

    try {
        // Get the image name for deletion
        const getPopupQuery = `SELECT image_name FROM PopupMessages WHERE popup_id = ?`;
        const popupResult = await dbClient.execute(getPopupQuery, [popup_id]);

        if (popupResult.rows.length === 0) {
            return new Response(JSON.stringify({ error: "Popup message not found" }), { status: 404 });
        }

        const imageName = popupResult.rows[0].image_name;

        // Delete the image from R2 if it exists
        if (imageName) {
            await env.KRISHI_BUCKET.delete(imageName);
        }
        const query = `DELETE FROM PopupMessages WHERE popup_id = ?`;
        await dbClient.execute(query, [popup_id]);

        return new Response(JSON.stringify({ message: "Popup message deleted successfully" }), { status: 200 });

    } catch (error) {
        console.error("Database error:", error);
        return new Response(JSON.stringify({ error: "Failed to delete popup message", details: error.message }), { status: 500 });
    }
}

async function getPopupMessages(request, dbClient, env) {
    const authenticationResponse = await validateSession(request, env);
    const isAuthenticated = authenticationResponse.status;

    try {
        let query = `
            SELECT popup_id, title, content, image_name, alt_text, start_date, end_date, active
            FROM PopupMessages
        `;

        if (!isAuthenticated) {
            query += `
            WHERE active = 1 AND
                  (start_date IS NULL OR datetime(start_date) <= datetime('now')) AND
                  (end_date IS NULL OR datetime(end_date) >= datetime('now'))
        `;
        }

        query += ` ORDER BY created_at DESC;`;
        const result = await dbClient.execute(query);

        const popupMessages = result.rows.map(row => ({
            ...row,
            image_url: row.image_name ? `${env.R2_PUBLIC_URL}/${row.image_name}` : null, // Construct the URL
        }));

        return new Response(JSON.stringify({ message: "Popup messages fetched successfully", popupMessages }), { status: 200 });
    } catch (error) {
        console.error("Database error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch popup messages", details: error.message }), { status: 500 });
    }
}

async function setPopupActiveStatus(request, dbClient, popup_id) {

    try {
        const { active } = await request.json();

        if (typeof active !== 'boolean') {
            return new Response(JSON.stringify({ error: "Invalid 'active' value. Must be a boolean." }), { status: 400 });
        }

        const query = `
            UPDATE PopupMessages
            SET active = ?
            WHERE popup_id = ?
        `;
        await dbClient.execute(query, [active ? 1 : 0, popup_id]);

        return new Response(JSON.stringify({ message: `Popup message ${active ? 'activated' : 'deactivated'} successfully` }), { status: 200 });

    } catch (error) {
        console.error("Database error:", error);
        return new Response(JSON.stringify({ error: "Failed to update popup message status", details: error.message }), { status: 500 });
    }
}

module.exports = { createPopupMessage, getPopupMessages, editPopupMessage, deletePopupMessage, setPopupActiveStatus };