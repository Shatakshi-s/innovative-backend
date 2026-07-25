import { getTursoClient } from './config/db.js';
const router = require('./routes/router');

// The new beginning 

export default {
	async fetch(request, env) {
		// Create the database client
		const dbClient = getTursoClient(env);


		// Parse the request URL
		// const { pathname } = new URL(request.url);
		// const type = request.method;

		// Handle the request via the router
		return router.handleRequest(request, env, dbClient);
	},
};
