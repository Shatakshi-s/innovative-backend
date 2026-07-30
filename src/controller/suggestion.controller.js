import validateSession from "../utils/validateSession.controller";

const getAllSuggestions = async (request, dbClient, env) => {
    const authenticationResponse = await validateSession(request, env);
    if (authenticationResponse.status) {
        try {
            const query = `SELECT * FROM suggestions ORDER BY created_at DESC`;
            const result = await dbClient.execute(query);
            return new Response(JSON.stringify({
                message: "Suggestions fetched successfully!",
                data: result.rows,
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return new Response(JSON.stringify({
                error: "Failed to retrieve suggestions",
                details: error.message,
            }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    } else {
        return new Response(JSON.stringify({
            error: "Unauthorized to retrieve suggestions."
        }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }
};

const getSuggestionById = async (request, id, dbClient, env) => {
    const authenticationResponse = await validateSession(request, env);
    if (authenticationResponse.status) {
        try {
            const query = `SELECT * FROM suggestions WHERE id = ?`;
            const result = await dbClient.execute(query, [id]);
            if (result.rows.length === 0) {
                return new Response(JSON.stringify({
                    error: "Suggestion not found",
                }), {
                    status: 404,
                    headers: { "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({
                message: "Suggestion fetched successfully!",
                data: result.rows[0]
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        } catch (error) {
            return new Response(JSON.stringify({
                error: "Failed to retrieve suggestion",
                details: error.message,
            }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    } else {
        return new Response(JSON.stringify({
            error: "Unauthorized to retrieve suggestion."
        }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }
};

const createSuggestion = async (request, dbClient) => {
    try {
        const { name, message, email } = await request.json();

        // Validate required fields
        if (!name || !message || !email) {
            return new Response(JSON.stringify({
                error: "Missing required fields: name, email, or message."
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Insert suggestion into the database
        const query = `
            INSERT INTO suggestions (name, message, email, read)
            VALUES (?, ?, ?, 0)
        `;
        await dbClient.execute(query, [name, message, email]);

        return new Response(JSON.stringify({
            message: "Suggestion submitted successfully!"
        }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: "Failed to submit suggestion",
            details: error.message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

const updateSuggestionStatus = async (request, id, dbClient, env) => {
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

        const query = `UPDATE suggestions SET \`read\` = ? WHERE id = ?`;
        const result = await dbClient.execute(query, [read, id]);

        if (result.rowsAffected === 0) {
            return new Response(JSON.stringify({ error: "Suggestion not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({
            message: `Suggestion marked as ${read ? 'read' : 'unread'} successfully!`
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });

    } catch (error) {
        return new Response(JSON.stringify({
            error: "Failed to update suggestion",
            details: error.message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

const deleteSuggestionById = async (request, id, dbClient, env) => {
    const auth = await validateSession(request, env);
    if (!auth.status) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const query = `DELETE FROM suggestions WHERE id = ?`;
        const result = await dbClient.execute(query, [id]);

        if (result.rowsAffected === 0) {
            return new Response(JSON.stringify({ error: "Suggestion not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({
            message: "Suggestion deleted successfully"
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });

    } catch (error) {
        return new Response(JSON.stringify({
            error: "Failed to delete suggestion",
            details: error.message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

module.exports = {
    getAllSuggestions,
    getSuggestionById,
    createSuggestion,
    deleteSuggestionById,
    updateSuggestionStatus
};
