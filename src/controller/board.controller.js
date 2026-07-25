import validateSession from "../utils/validateSession.controller";

async function getNextSectionDisplayOrder(dbClient) {
    try {
        const result = await dbClient.execute(`SELECT MAX(display_order) as max_order FROM BoardSections`);
        const maxOrder = result.rows && result.rows.length > 0 ? result.rows[0].max_order : 0;
        return (maxOrder === null ? 0 : maxOrder) + 1;
    } catch (err) {
        console.error("Error fetching max display order:", err);
        throw new Error("Could not determine next display order for section.");
    }
}

async function ensureSection(formData, dbClient) {
    const section_id_str = formData.get("section_id");
    const section_name = formData.get("section_name")?.trim();

    if (section_id_str && section_id_str !== '--new--') {
        const section_id = parseInt(section_id_str, 10);
        if (isNaN(section_id)) {
            throw new Error(`Invalid section_id provided: '${section_id_str}'. Must be a number.`);
        }
        const sectionRes = await dbClient.execute(
            `SELECT section_id FROM BoardSections WHERE section_id = ?`,
            [section_id]
        );
        if (sectionRes.rows && sectionRes.rows.length > 0) {
            return section_id;
        } else {
            throw new Error(`Section with ID ${section_id} not found.`);
        }
    }
    else if (section_name) {
        if (!section_name) {
            throw new Error("New section name cannot be empty.");
        }

        const checkRes = await dbClient.execute(
            `SELECT section_id FROM BoardSections WHERE section_name = ? COLLATE NOCASE`,
            [section_name]
        );

        if (checkRes.rows && checkRes.rows.length > 0) {
            return checkRes.rows[0].section_id;
        } else {
            try {
                const nextOrder = await getNextSectionDisplayOrder(dbClient);
                const insertSectionRes = await dbClient.execute(
                    `INSERT INTO BoardSections (section_name, display_order) VALUES (?, ?) RETURNING section_id`,
                    [section_name, nextOrder]
                );

                if (insertSectionRes.rows && insertSectionRes.rows.length > 0 && insertSectionRes.rows[0].section_id != null) {
                    return insertSectionRes.rows[0].section_id;
                } else {
                    console.error("Insert section result unexpected:", insertSectionRes);
                    throw new Error("Failed to insert new section or retrieve its ID after insert.");
                }
            } catch (dbError) {
                if (dbError.message && (dbError.message.includes('UNIQUE constraint failed: BoardSections.section_name') || dbError.message.includes('duplicate key value violates unique constraint'))) {
                    console.warn(`Race condition or duplicate section name detected for: ${section_name}. Attempting to fetch existing.`);
                    const retryCheckRes = await dbClient.execute(`SELECT section_id FROM BoardSections WHERE section_name = ? COLLATE NOCASE`, [section_name]);
                    if (retryCheckRes.rows && retryCheckRes.rows.length > 0) {
                        return retryCheckRes.rows[0].section_id;
                    } else {
                        throw new Error(`Failed UNIQUE constraint for section '${section_name}', but couldn't find existing.`);
                    }
                } else if (dbError.message && dbError.message.includes('UNIQUE constraint failed: BoardSections.display_order')) {
                    throw new Error(`Failed to assign unique display order for section '${section_name}'. Please try again.`);
                }
                throw new Error(`Database error creating section '${section_name}': ${dbError.message}`);
            }
        }
    }
    else {
        throw new Error("A section selection (existing ID or new name) is required.");
    }
}

async function createDirector(request, dbClient, env) {
    const auth = await validateSession(request, env);
    if (!auth.status) return new Response(JSON.stringify(auth), { status: 401 });

    try {
        const formData = await request.formData();
        const name = formData.get('name');
        const position = formData.get('position');
        const department = formData.get('department');
        const hierarchical_id_str = formData.get('hierarchical_id');
        const image_data = formData.get('image_data');
        const alt_text = formData.get('alt_text');

        if (!name || !position || !hierarchical_id_str) {
            return new Response(JSON.stringify({ error: "Missing required fields: name, position, or hierarchical rank." }), { status: 400 });
        }
        const hierarchical_id = parseInt(hierarchical_id_str, 10);
        if (isNaN(hierarchical_id) || hierarchical_id < 1) {
            return new Response(JSON.stringify({ error: "Hierarchical rank must be a positive number." }), { status: 400 });
        }

        const final_section_id = await ensureSection(formData, dbClient);

        let imageName = null;
        if (image_data && image_data instanceof File && image_data.size > 0) {
            imageName = `${Date.now()}-${image_data.name.replace(/[^a-zA-Z0-9._-]/g, '')}`;
            try {
                await env.KRISHI_BUCKET.put(imageName, image_data.stream(), {
                    httpMetadata: { contentType: image_data.type },
                });
            } catch (uploadError) {
                console.error("R2 Upload Error:", uploadError);
                throw new Error(`Failed to upload image: ${uploadError.message}`);
            }
        }

        const query = `
            INSERT INTO BoardOfDirectors
            (name, position, department, section_id, hierarchical_id, image_name, alt_text, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
            RETURNING director_id;
        `;

        if (final_section_id == null || typeof final_section_id !== 'number') {
            console.error("FATAL: final_section_id is invalid before Director INSERT", final_section_id);
            throw new Error("Internal Server Error: Could not determine section ID.");
        }

        const result = await dbClient.execute(query, [
            name,
            position,
            department || null,
            final_section_id,
            hierarchical_id,
            imageName,
            alt_text || null
        ]);

        if (!result.rows || result.rows.length === 0) {
            throw new Error("Failed to insert director or retrieve the new ID.");
        }

        return new Response(JSON.stringify({
            message: "Director added successfully!",
            director_id: result.rows[0].director_id
        }), { status: 201, headers: { "Content-Type": "application/json" } });

    } catch (error) {
        console.error("Error in createDirector:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        return new Response(JSON.stringify({
            error: "Failed to add director.",
            details: errorMessage
        }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}

async function editDirector(request, dbClient, director_id, env) {
    const auth = await validateSession(request, env);
    if (!auth.status) return new Response(JSON.stringify(auth), { status: 401 });

    if (!director_id) {
        return new Response(JSON.stringify({ error: "Director ID is required for editing." }), { status: 400 });
    }

    try {
        const formData = await request.formData();
        const name = formData.get('name');
        const position = formData.get('position');
        const department = formData.get('department');
        const hierarchical_id_str = formData.get('hierarchical_id');
        const alt_text = formData.get('alt_text');
        const image_data = formData.get('image_data');

        if (!name || !position || !hierarchical_id_str) {
            return new Response(JSON.stringify({ error: "Missing required fields: name, position, or hierarchical rank." }), { status: 400 });
        }
        const hierarchical_id = parseInt(hierarchical_id_str, 10);
        if (isNaN(hierarchical_id) || hierarchical_id < 1) {
            return new Response(JSON.stringify({ error: "Hierarchical rank must be a positive number." }), { status: 400 });
        }

        const final_section_id = await ensureSection(formData, dbClient);
        if (final_section_id == null || typeof final_section_id !== 'number') {
            console.error("FATAL: final_section_id is invalid before Director UPDATE", final_section_id);
            throw new Error("Internal Server Error: Could not determine section ID for update.");
        }

        const currentDataRes = await dbClient.execute(`SELECT image_name FROM BoardOfDirectors WHERE director_id = ?`, [director_id]);
        if (!currentDataRes.rows || currentDataRes.rows.length === 0) {
            return new Response(JSON.stringify({ error: "Director not found" }), { status: 404 });
        }
        const currentImageName = currentDataRes.rows[0].image_name;
        let newImageName = currentImageName;

        if (image_data && image_data instanceof File && image_data.size > 0) {
            newImageName = `${Date.now()}-${image_data.name.replace(/[^a-zA-Z0-9._-]/g, '')}`;
            try {
                await env.KRISHI_BUCKET.put(newImageName, image_data.stream(), { httpMetadata: { contentType: image_data.type } });
                if (currentImageName && currentImageName !== newImageName) {
                    try { await env.KRISHI_BUCKET.delete(currentImageName); }
                    catch (deleteError) { console.warn(`Failed to delete old image '${currentImageName}' from R2:`, deleteError); }
                }
            } catch (uploadError) {
                console.error("R2 Upload Error during edit:", uploadError);
                throw new Error(`Failed to upload replacement image: ${uploadError.message}`);
            }
        }

        const query = `
            UPDATE BoardOfDirectors
            SET name = ?, position = ?, department = ?, hierarchical_id = ?,
                section_id = ?, image_name = ?, alt_text = ?
            WHERE director_id = ?;
        `;
        await dbClient.execute(query, [
            name, position, department || null, hierarchical_id,
            final_section_id,
            newImageName, alt_text || null, director_id
        ]);

        return new Response(JSON.stringify({ message: "Director updated successfully!" }), { status: 200 });

    } catch (error) {
        console.error("Error in editDirector:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        return new Response(JSON.stringify({ error: "Failed to edit director.", details: errorMessage }), { status: 500 });
    }
}

async function getAllDirectors(dbClient, env, isAuthenticated) {
    try {
        const sectionsResult = await dbClient.execute(
            `SELECT section_id, section_name, display_order FROM BoardSections ORDER BY display_order ASC`
        );
        const availableSections = sectionsResult.rows || [];

        let directorQuery = `
            SELECT d.*, s.section_name, s.display_order as section_display_order
            FROM BoardOfDirectors d
            JOIN BoardSections s ON d.section_id = s.section_id
        `;
        if (!isAuthenticated) {
            directorQuery += ` WHERE d.active = TRUE`;
        }
        directorQuery += ` ORDER BY s.display_order ASC, d.hierarchical_id ASC`;

        const directorResult = await dbClient.execute(directorQuery);
        const allDirectors = directorResult.rows || [];

        const groupedSectionsMap = new Map();

        availableSections.forEach(sec => {
            groupedSectionsMap.set(sec.section_id, {
                section_id: sec.section_id,
                section_name: sec.section_name,
                display_order: sec.display_order,
                directors: []
            });
        });

        allDirectors.forEach(dir => {
            if (groupedSectionsMap.has(dir.section_id)) {
                groupedSectionsMap.get(dir.section_id).directors.push({
                    director_id: dir.director_id,
                    name: dir.name,
                    position: dir.position,
                    department: dir.department,
                    hierarchical_id: dir.hierarchical_id,
                    image_url: dir.image_name ? `${env.R2_PUBLIC_URL}/${dir.image_name}` : null,
                    alt_text: dir.alt_text,
                    active: Boolean(dir.active)
                });
            }
        });

        const finalSections = Array.from(groupedSectionsMap.values());

        return new Response(JSON.stringify({
            message: "Data fetched successfully!",
            availableSections: availableSections,
            sections: finalSections
        }), { status: 200, headers: { "Content-Type": "application/json" } });

    } catch (error) {
        console.error("Error in getAllDirectors:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        return new Response(JSON.stringify({ error: "Failed to fetch board data", details: errorMessage }), { status: 500 });
    }
}

// Add this helper function somewhere in the file
async function checkAndDeleteEmptySection(dbClient, section_id) {
    if (!section_id) return; // Do nothing if section_id is invalid

    try {
        // Check if any directors remain in this section
        const countRes = await dbClient.execute(
            `SELECT COUNT(*) as count FROM BoardOfDirectors WHERE section_id = ?`,
            [section_id]
        );

        const remainingCount = countRes.rows && countRes.rows.length > 0 ? countRes.rows[0].count : 0;

        if (remainingCount === 0) {
            // No directors left, delete the section
            console.log(`Section ID ${section_id} is empty. Deleting...`);
            await dbClient.execute(
                `DELETE FROM BoardSections WHERE section_id = ?`,
                [section_id]
            );
            console.log(`Section ID ${section_id} deleted successfully.`);
        }
    } catch (error) {
        // Log the error but don't fail the primary director deletion response
        console.error(`Error checking/deleting empty section ${section_id}:`, error);
    }
}


// --- MODIFIED deleteDirector Function ---
async function deleteDirector(request, dbClient, director_id, env) {
    const auth = await validateSession(request, env);
    if (!auth.status) return new Response(JSON.stringify(auth), { status: 401 });

    if (!director_id) {
        return new Response(JSON.stringify({ error: "Director ID is required for deletion." }), { status: 400 });
    }

    let sectionIdToDeleteCheck = null; // Variable to store the section ID

    try {
        // 1. Get director's info (including section_id and image_name) BEFORE deleting
        const directorInfoRes = await dbClient.execute(
            `SELECT section_id, image_name FROM BoardOfDirectors WHERE director_id = ?`,
            [director_id]
        );

        if (!directorInfoRes.rows || directorInfoRes.rows.length === 0) {
            return new Response(JSON.stringify({ error: "Director not found" }), { status: 404 });
        }

        sectionIdToDeleteCheck = directorInfoRes.rows[0].section_id; // Store the section ID
        const imageName = directorInfoRes.rows[0].image_name;

        // 2. Delete the director record
        // Consider using db.batch if available for atomicity with the check below
        await dbClient.execute(`DELETE FROM BoardOfDirectors WHERE director_id = ?`, [director_id]);

        // 3. Delete the image from R2 (if it exists)
        if (imageName) {
            try {
                await env.KRISHI_BUCKET.delete(imageName);
            } catch (deleteError) {
                console.warn(`Failed to delete image '${imageName}' from R2 after deleting director ${director_id}:`, deleteError);
            }
        }

        // 4. Check if the section is now empty and delete it if necessary
        // This happens *after* the director is successfully deleted
        await checkAndDeleteEmptySection(dbClient, sectionIdToDeleteCheck);

        // 5. Return success response for the director deletion
        return new Response(JSON.stringify({ message: "Director deleted successfully!" }), { status: 200 });

    } catch (error) {
        console.error("Error in deleteDirector:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        // Even if checkAndDeleteEmptySection fails, the primary error is likely from director deletion
        return new Response(JSON.stringify({ error: "Failed to delete director.", details: errorMessage }), { status: 500 });
    }
}


async function setDirectorActiveStatus(request, dbClient, director_id, env) {
    const auth = await validateSession(request, env);
    if (!auth.status) return new Response(JSON.stringify(auth), { status: 401 });
    if (!director_id) {
        return new Response(JSON.stringify({ error: "Director ID is required." }), { status: 400 });
    }
    try {
        const { active } = await request.json();
        if (typeof active !== "boolean") {
            return new Response(JSON.stringify({ error: "'active' field must be a boolean." }), { status: 400 });
        }
        await dbClient.execute(`UPDATE BoardOfDirectors SET active = ? WHERE director_id = ?`, [active, director_id]);
        return new Response(JSON.stringify({ message: `Director status updated (${active ? 'Activated' : 'Deactivated'}).` }), { status: 200 });
    } catch (error) {
        console.error("Error in setDirectorActiveStatus:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        return new Response(JSON.stringify({ error: "Failed to update director status.", details: errorMessage }), { status: 500 });
    }
}

module.exports = {
    createDirector,
    editDirector,
    deleteDirector,
    getAllDirectors,
    setDirectorActiveStatus,
};