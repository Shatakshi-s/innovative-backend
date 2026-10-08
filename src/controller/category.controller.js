import validateSession from "../utils/validateSession.controller";

const createSlug = (name) => {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
};

const getAllCategories = async (dbClient) => {
    try {
        const query = `SELECT category_id, name, slug, created_at FROM categories ORDER BY name ASC`;
        const result = await dbClient.execute(query);
        const categories = result.rows.map(row => ({
            category_id: Number(row.category_id),
            name: String(row.name),
            slug: String(row.slug),
            created_at: row.created_at
        }));

        return new Response(JSON.stringify({
            message: "Categories fetched successfully!",
            categories: categories,
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: "Failed to fetch categories",
            details: error.message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

const createCategory = async (request, dbClient, env) => {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }

    try {
        let name = '';
        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            const body = await request.json();
            name = body.name ? body.name.trim() : '';
        } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
            const formData = await request.formData();
            name = formData.get('name') ? formData.get('name').trim() : '';
        }

        if (!name) {
            return new Response(JSON.stringify({
                error: "Category name is required."
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        let slug = createSlug(name);
        if (!slug) slug = `cat-${Date.now()}`;

        // Check if category already exists (case-insensitive check)
        const checkQuery = `SELECT category_id, name, slug FROM categories WHERE LOWER(name) = LOWER(?)`;
        const checkResult = await dbClient.execute(checkQuery, [name]);

        if (checkResult.rows && checkResult.rows.length > 0) {
            const existing = checkResult.rows[0];
            return new Response(JSON.stringify({
                message: "Category already exists",
                category: {
                    category_id: Number(existing.category_id),
                    name: String(existing.name),
                    slug: String(existing.slug)
                }
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        const insertQuery = `INSERT INTO categories (name, slug) VALUES (?, ?)`;
        const insertResult = await dbClient.execute(insertQuery, [name, slug]);

        // Get newly inserted category_id
        let newCategoryId = insertResult.lastInsertRowid ? Number(insertResult.lastInsertRowid) : null;
        if (!newCategoryId) {
            const fetchNew = await dbClient.execute(`SELECT category_id FROM categories WHERE slug = ?`, [slug]);
            if (fetchNew.rows && fetchNew.rows.length > 0) {
                newCategoryId = Number(fetchNew.rows[0].category_id);
            }
        }

        const newCategory = {
            category_id: newCategoryId,
            name: name,
            slug: slug
        };

        return new Response(JSON.stringify({
            message: "Category created successfully!",
            category: newCategory
        }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
        });

    } catch (error) {
        return new Response(JSON.stringify({
            error: "Failed to create category",
            details: error.message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

const deleteCategory = async (request, dbClient, env, category_id) => {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }

    try {
        await dbClient.execute(`DELETE FROM product_categories WHERE category_id = ?`, [category_id]);
        await dbClient.execute(`DELETE FROM categories WHERE category_id = ?`, [category_id]);

        return new Response(JSON.stringify({
            message: "Category deleted successfully!"
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: "Failed to delete category",
            details: error.message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

module.exports = { getAllCategories, createCategory, deleteCategory };
