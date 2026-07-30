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
