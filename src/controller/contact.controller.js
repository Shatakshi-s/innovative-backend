import validateSession from "../utils/validateSession.controller";

async function activateContact(id, request, dbClient, env) {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }
    try {
        // Deactivate all other contacts
        const deactivateQuery = `UPDATE contacts SET status = 'inactive' WHERE status = 'active'`;
        await dbClient.execute(deactivateQuery);

        // Activate the selected contact
        const activateQuery = `UPDATE contacts SET status = 'active' WHERE id = ?`;
        await dbClient.execute(activateQuery, [id]);

        return new Response(JSON.stringify({ message: "Contact activated successfully!" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: "Failed to activate contact", details: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
async function createContact(request, dbClient, env) {
    const authenticationResponse = await validateSession(request, env);
    if (authenticationResponse.status) {
        try {
            const { name, company_name, address, location, phone, mobile, additional_numbers, email, additional_emails } = await request.json();

            if (!name || !email) {
                return new Response(JSON.stringify({ error: "Missing required fields: name or email." }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }

            const insertQuery = `
                INSERT INTO contacts (name, company_name, address, location, phone, mobile, additional_numbers, email, additional_emails, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'inactive')
            `;


            await dbClient.execute(insertQuery, [
                name,
                company_name,
                address,
                location,
                phone,
                mobile,
                JSON.stringify(additional_numbers || []),
                email,
                JSON.stringify(additional_emails || []),
            ]);

            return new Response(JSON.stringify({ message: "Contact created successfully!" }), {
                status: 201,
                headers: { "Content-Type": "application/json" },
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: "Failed to create contact", details: error.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    }
    return new Response(JSON.stringify(authenticationResponse), { status: 401 });
}

async function editContact(id, request, dbClient, env) {
    const authenticationResponse = await validateSession(request, env);
    if (authenticationResponse.status) {
        try {
            const { name, company_name, address, location, phone, mobile, additional_numbers, email, additional_emails } = await request.json();

            const updateQuery = `
                UPDATE contacts
                SET name = ?, company_name = ?, address = ?, location = ?, phone = ?, mobile = ?,
                    additional_numbers = ?, email = ?, additional_emails = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;

            await dbClient.execute(updateQuery, [
                name,
                company_name,
                address,
                location,
                phone,
                mobile,
                JSON.stringify(additional_numbers || []),
                email,
                JSON.stringify(additional_emails || []),
                id,
            ]);

            return new Response(JSON.stringify({ message: "Contact updated successfully!" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: "Failed to update contact", details: error.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    }
    return new Response(JSON.stringify(authenticationResponse), { status: 401 });
}

async function getAllContacts(dbClient, env, isAuthenticated) {
    try {
        let query = `SELECT * FROM contacts`;

        if (!isAuthenticated) {
            query += ` WHERE status = 'active'`;
        }

        const { rows } = await dbClient.execute(query);

        return new Response(JSON.stringify({ message: "Contacts fetched successfully!", contacts: rows }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: "Failed to fetch contact", details: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        })
    }

}
async function deleteContact(id, request, dbClient, env) {
    const authenticationResponse = await validateSession(request, env);
    if (authenticationResponse.status) {
        try {
            const deleteQuery = `
                DELETE FROM contacts
                WHERE id = ?
            `;
            await dbClient.execute(deleteQuery, [id]);

            return new Response(JSON.stringify({ message: "Contact deleted successfully!" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: "Failed to delete contact", details: error.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    }
    return new Response(JSON.stringify(authenticationResponse), { status: 401 });
}



module.exports = { activateContact, createContact, editContact, deleteContact, getAllContacts };