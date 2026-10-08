import { getTursoClient } from './config/db.js';
const router = require('./routes/router');

let dbInitialized = false;

async function ensureTables(dbClient) {
	if (dbInitialized) return;
	try {
		await dbClient.execute(`
			CREATE TABLE IF NOT EXISTS PopupMessages (
				popup_id INTEGER PRIMARY KEY AUTOINCREMENT,
				title TEXT NOT NULL,
				content TEXT NOT NULL,
				image_name TEXT,
				alt_text TEXT,
				start_date TEXT,
				end_date TEXT,
				active INTEGER DEFAULT 1,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
		`);
		await dbClient.execute(`
			CREATE TABLE IF NOT EXISTS suggestions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				email TEXT NOT NULL,
				message TEXT NOT NULL,
				read INTEGER DEFAULT 0,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
		`);
		await dbClient.execute(`
			CREATE TABLE IF NOT EXISTS categories (
				category_id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL UNIQUE,
				slug TEXT NOT NULL UNIQUE,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
		`);
		await dbClient.execute(`
			CREATE TABLE IF NOT EXISTS product_categories (
				product_id INTEGER NOT NULL,
				category_id INTEGER NOT NULL,
				PRIMARY KEY (product_id, category_id),
				FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
				FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE
			);
		`);

		// Seed initial categories if none exist
		const catCheck = await dbClient.execute(`SELECT COUNT(*) as count FROM categories`);
		const count = catCheck.rows && catCheck.rows[0] ? Number(catCheck.rows[0].count) : 0;
		if (count === 0) {
			const initialCategories = [
				{ name: 'Fertilizers', slug: 'fertilizers' },
				{ name: 'Seeds', slug: 'seeds' },
				{ name: 'Equipment & Tools', slug: 'equipment-tools' },
				{ name: 'Pesticides', slug: 'pesticides' },
				{ name: 'Irrigation', slug: 'irrigation' },
				{ name: 'Organic Farming', slug: 'organic-farming' }
			];
			for (const cat of initialCategories) {
				try {
					await dbClient.execute(
						`INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)`,
						[cat.name, cat.slug]
					);
				} catch (e) {
					console.error("Failed to seed category:", cat.name, e);
				}
			}
		}
		dbInitialized = true;
	} catch (error) {
		console.error("Failed to initialize database tables:", error);
	}
}

export default {
	async fetch(request, env) {
		// Create the database client
		const dbClient = getTursoClient(env);

		// Ensure tables exist
		await ensureTables(dbClient);

		// Handle the request via the router
		return router.handleRequest(request, env, dbClient);
	},
};
