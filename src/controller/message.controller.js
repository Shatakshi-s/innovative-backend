import validateSession from "../utils/validateSession.controller"; 

const getAllMessages = async (request, dbClient, env) => {
    const authenticationResponse = await validateSession(request, env);
    if (authenticationResponse.status) {
        try {
            const query = `SELECT * FROM messages ORDER BY created_at DESC`;
            const result = await dbClient.execute(query);
            return new Response(JSON.stringify({
                message: "Messages fetched successfully!", 
                data: result.rows,
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return new Response(JSON.stringify({
                error: "Failed to retrieve messages",
                details: error.message,
            }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    } else {
        return new Response(JSON.stringify({
            error: "Unauthorized to retrieve messages." 
        }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }
};

const getMessageById = async (request, id, dbClient, env) => { // Added request and env parameters
    const authenticationResponse = await validateSession(request, env);
    if (authenticationResponse.status) {
        try {
            const query = `SELECT * FROM messages WHERE id = ?`;
            const result = await dbClient.execute(query, [id]);
            if (result.rows.length === 0) { 
                return new Response(JSON.stringify({
                    error: "Message not found",
                }), {
                    status: 404,
                    headers: { "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({
                message: "Message fetched successfully!", 
                data: result.rows[0]
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        } catch (error) {
            return new Response(JSON.stringify({
                error: "Failed to retrieve message",
                details: error.message,
            }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    } else {
        return new Response(JSON.stringify({
            error: "Unauthorized to retrieve message." 
        }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }
};

const createMessage = async (request, dbClient) => {
    try {
        const { name, message, email, contact_number } = await request.json();

        // Validate required fields
        if (!name || !message || !email) {
            return new Response(JSON.stringify({
                error: "Missing required fields: name, message, or email."
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Insert message into the database
        const query = `
            INSERT INTO messages (name, message, email, contact_number, read)
            VALUES (?, ?, ?, ?, 0)
        `;
        await dbClient.execute(query, [
            name,
            message,
            email,
            contact_number || null,
        ]);

        return new Response(JSON.stringify({
            message: "Message created successfully!"
        }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: "Failed to create message",
            details: error.message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

const updateMessageStatus = async (request, id, dbClient, env) => {
    const auth = await validateSession(request, env);
    if (!auth.status) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const { read } = await request.json();

        if (typeof read !== "boolean") {
            return new Response(JSON.stringify({
                error: "`read` must be a boolean value (true or false)."
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const query = `UPDATE messages SET \`read\` = ? WHERE id = ?`;
        const result = await dbClient.execute(query, [read, id]);

        if (result.rowsAffected === 0) {
            return new Response(JSON.stringify({ error: "Message not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({
            message: `Message marked as ${read ? 'read' : 'unread'} successfully!`
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });

    } catch (error) {
        return new Response(JSON.stringify({
            error: "Failed to update message",
            details: error.message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

const deleteMessageById = async (request, id, dbClient, env) => {
    const auth = await validateSession(request, env);
    if (!auth.status) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const query = `DELETE FROM messages WHERE id = ?`;
        const result = await dbClient.execute(query, [id]);

        if (result.rowsAffected === 0) {
            return new Response(JSON.stringify({ error: "Message not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({
            message: "Message deleted successfully"
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });

    } catch (error) {
        return new Response(JSON.stringify({
            error: "Failed to delete message",
            details: error.message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};


module.exports = {
    getAllMessages,
    getMessageById,
    createMessage,
    deleteMessageById,
    updateMessageStatus
};