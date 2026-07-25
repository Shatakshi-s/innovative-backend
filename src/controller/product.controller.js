import validateSession from "../utils/validateSession.controller";

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
        await dbClient.execute(query, [
            name,
            description || null,
            price,
            imageName || null,
            alt_text || null,
            rating,
            review_count,
            available,
        ]);

        return new Response(JSON.stringify({
            message: "Product created successfully!",
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
        const products = result.rows.map(row => ({
            ...row,
            image_url: row.image_name ? `${env.R2_PUBLIC_URL}/${row.image_name}` : null,
        }));

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
        const deleteImage = formData.get('delete_image') === 'true'; // New field

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
            imageName = null;  // Explicitly set image_name to NULL if the user wants to delete the image
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
        // Get the current product to access the image name for deletion
        const getProductQuery = `SELECT image_name FROM products WHERE product_id = ?`;
        const productResult = await dbClient.execute(getProductQuery, [product_id]);

        if (productResult.rows.length === 0) {
            return new Response(JSON.stringify({ error: "Product not found" }), { status: 404 });
        }

        const imageName = productResult.rows[0].image_name;

        // Delete the image from R2 if it exists
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