import validateSession from "../utils/validateSession.controller";

const parseCategoryIds = (rawCategories) => {
    if (!rawCategories) return [];
    try {
        const parsed = JSON.parse(rawCategories);
        if (Array.isArray(parsed)) return parsed.map(id => Number(id)).filter(id => !isNaN(id));
    } catch (e) {
        // Fallback for comma separated string
    }
    if (typeof rawCategories === 'string') {
        return rawCategories.split(',').map(id => Number(id.trim())).filter(id => !isNaN(id));
    }
    return [];
};

const createProduct = async (request, dbClient, env) => {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }
    try {
        const formData = await request.formData();
        const name = formData.get('name');
        const description = formData.get('description');
        const price = parseFloat(formData.get('price'));
        const image_data = formData.get('image_data');
        const alt_text = formData.get('alt_text');
        const rating = parseFloat(formData.get('rating')) || 0;
        const review_count = parseInt(formData.get('review_count')) || 0;
        const available = formData.get('available') === 'true';
        const rawCategories = formData.get('category_ids');
        const categoryIds = parseCategoryIds(rawCategories);

        if (!name || isNaN(price)) {
            return new Response(JSON.stringify({
                error: "Missing required fields: name or price.",
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
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
            INSERT INTO products (name, description, price, image_name, alt_text, rating, review_count, available)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const insertResult = await dbClient.execute(query, [
            name,
            description || null,
            price,
            imageName || null,
            alt_text || null,
            rating,
            review_count,
            available,
        ]);

        let newProductId = insertResult.lastInsertRowid ? Number(insertResult.lastInsertRowid) : null;
        if (!newProductId) {
            const fetchIdResult = await dbClient.execute(`SELECT product_id FROM products ORDER BY product_id DESC LIMIT 1`);
            if (fetchIdResult.rows && fetchIdResult.rows.length > 0) {
                newProductId = Number(fetchIdResult.rows[0].product_id);
            }
        }

        if (newProductId && categoryIds.length > 0) {
            for (const catId of categoryIds) {
                await dbClient.execute(
                    `INSERT OR IGNORE INTO product_categories (product_id, category_id) VALUES (?, ?)`,
                    [newProductId, Number(catId)]
                );
            }
        }

        return new Response(JSON.stringify({
            message: "Product created successfully!",
            product_id: newProductId
        }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: "Failed to create product",
            details: error.message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

const getAllProducts = async (dbClient, env, isAuthenticated) => {
    try {
        let query = 'SELECT * FROM products';
        let whereClause = '';
        let params = [];

        if (!isAuthenticated) {
            whereClause = ' WHERE available = true';
        }

        query += whereClause + ' ORDER BY created_at DESC';

        const result = await dbClient.execute(query, params);

        // Fetch categories for all products
        let productCategoriesMap = {};
        try {
            const catQuery = `
                SELECT pc.product_id, c.category_id, c.name, c.slug 
                FROM product_categories pc 
                JOIN categories c ON pc.category_id = c.category_id
            `;
            const catResult = await dbClient.execute(catQuery);
            if (catResult.rows) {
                catResult.rows.forEach(row => {
                    const pId = Number(row.product_id);
                    if (!productCategoriesMap[pId]) {
                        productCategoriesMap[pId] = [];
                    }
                    productCategoriesMap[pId].push({
                        category_id: Number(row.category_id),
                        name: String(row.name),
                        slug: String(row.slug)
                    });
                });
            }
        } catch (catErr) {
            console.error("Failed to load product categories:", catErr);
        }

        const products = result.rows.map(row => {
            const pId = Number(row.product_id);
            return {
                ...row,
                image_url: row.image_name ? `${env.R2_PUBLIC_URL}/${row.image_name}` : null,
                categories: productCategoriesMap[pId] || []
            };
        });

        return new Response(JSON.stringify({
            message: "Products fetched successfully!",
            productCount: products.length,
            products: products,
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: "Failed to fetch products",
            details: error.message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

const editProduct = async (request, dbClient, env, product_id) => {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }
    try {
        const formData = await request.formData();
        const name = formData.get('name');
        const description = formData.get('description');
        const price = parseFloat(formData.get('price'));
        const image_data = formData.get('image_data');
        const alt_text = formData.get('alt_text');
        const rating = parseFloat(formData.get('rating')) || 0;
        const review_count = parseInt(formData.get('review_count')) || 0;
        const available = formData.get('available') === 'true';
        const deleteImage = formData.get('delete_image') === 'true';
        const rawCategories = formData.get('category_ids');

        if (!name || isNaN(price)) {
            return new Response(JSON.stringify({
                error: "Missing required fields: name or price.",
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
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
        } else if (deleteImage) {
            imageName = null;
        }

        const query = `
            UPDATE products
            SET name = ?, description = ?, price = ?, image_name = COALESCE(?, image_name), alt_text = COALESCE(?, alt_text), rating = ?, review_count = ?, available = ?
            WHERE product_id = ?
        `;
        await dbClient.execute(query, [
            name,
            description || null,
            price,
            imageName,
            alt_text || null,
            rating,
            review_count,
            available,
            product_id,
        ]);

        if (rawCategories !== null) {
            const categoryIds = parseCategoryIds(rawCategories);
            await dbClient.execute(`DELETE FROM product_categories WHERE product_id = ?`, [product_id]);
            for (const catId of categoryIds) {
                await dbClient.execute(
                    `INSERT OR IGNORE INTO product_categories (product_id, category_id) VALUES (?, ?)`,
                    [product_id, Number(catId)]
                );
            }
        }

        return new Response(JSON.stringify({
            message: "Product updated successfully!",
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: "Failed to update product",
            details: error.message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

const deleteProduct = async (dbClient, request, env, product_id) => {
    const authenticationResponse = await validateSession(request, env);
    if (!authenticationResponse.status) {
        return new Response(JSON.stringify(authenticationResponse), { status: 401 });
    }
    try {
        const getProductQuery = `SELECT image_name FROM products WHERE product_id = ?`;
        const productResult = await dbClient.execute(getProductQuery, [product_id]);

        if (productResult.rows.length === 0) {
            return new Response(JSON.stringify({ error: "Product not found" }), { status: 404 });
        }

        const imageName = productResult.rows[0].image_name;

        if (imageName) {
            await env.KRISHI_BUCKET.delete(imageName);
        }

        const query = `
            UPDATE products
            SET available = false
            WHERE product_id = ?
        `;
        await dbClient.execute(query, [product_id]);

        return new Response(JSON.stringify({
            message: "Product deactivated successfully!",
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: "Failed to deactivate product",
            details: error.message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

module.exports = { createProduct, getAllProducts, editProduct, deleteProduct };