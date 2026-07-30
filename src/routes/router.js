////////////////////////////////
//                            //
//  Link Files and Functions  //
//                            //
////////////////////////////////
import validateSession from "../utils/validateSession.controller";


const { login, signup } = require('../controller/auth.controller');
const { getAllBlogs, getBlogById, createBlog, updateBlog, deleteBlog, getPublishedBlogs, getPublishedBlogById } = require('../controller/blog.controller');
const { createDirector, editDirector, deleteDirector, getAllDirectors, setDirectorActiveStatus } = require('../controller/board.controller');
const { activateContact, createContact, editContact, viewContact, deleteContact, getActiveContact, getAllContacts } = require('../controller/contact.controller');
const { createPopupMessage, getPopupMessages, editPopupMessage, deletePopupMessage, setPopupActiveStatus } = require('../controller/popup.controller');
const { createProduct, getAllProducts, editProduct, deleteProduct } = require('../controller/product.controller')
const { getAllMessages, getMessageById, createMessage, deleteMessageById, updateMessageStatus } = require('../controller/message.controller');
const { getAllSuggestions, getSuggestionById, createSuggestion, deleteSuggestionById, updateSuggestionStatus } = require('../controller/suggestion.controller');
const { createPublication, getPublications, editPublication, deletePublication, setPublicationActiveStatus } = require("../controller/publications.controller")
const { createMedia, getMedia, editMedia, deleteMedia } = require('../controller/media.controller');
const { getDashboardSummary } = require('../controller/dashboard.controller');

////////////////////////////////
//                            //
//   Don't Touch This Class   //
//                            //
////////////////////////////////

class Router {
    constructor() {
        this.routes = {};
    }

    addRoute(path, methods) {
        this.routes[path] = methods;
    }

    async handleRequest(request, env, dbClient) {
        const url = new URL(request.url);
        const path = url.pathname; // Get the pathname
        const type = request.method;

        // Check for exact match first, before parameter matching:
        const exactRoute = this.routes[path];
        if (exactRoute) {
            const handler = exactRoute[type];
            if (!handler) {
                return new Response(JSON.stringify({ error: "Method not allowed" }), {
                    status: 405,
                    headers: { "Content-Type": "application/json" },
                });
            }
            try {
                return await handler(request, dbClient, env);
            } catch (error) {
                return new Response(JSON.stringify({
                    error: "Server error",
                    details: error.message
                }), {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                });
            }
        }

        // Handle parameter matching routes
        for (const routePath in this.routes) {
            const routeRegex = new RegExp('^' + routePath.replace(/:\w+/g, '([^/]+)') + '$');
            const match = path.match(routeRegex);

            if (match) {
                const params = {};
                const paramNames = (routePath.match(/:(\w+)/g) || []).map(p => p.slice(1));
                for (let i = 1; i < match.length; i++) {
                    params[paramNames[i - 1]] = match[i]
                }
                request.params = params;

                const handler = this.routes[routePath][type];
                if (!handler) {
                    return new Response(JSON.stringify({ error: "Method not allowed" }), {
                        status: 405,
                        headers: { "Content-Type": "application/json" },
                    });
                }
                try {
                    return await handler(request, dbClient, env);
                } catch (error) {
                    return new Response(JSON.stringify({
                        error: "Server error",
                        details: error.message
                    }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            }

        }


        return new Response(JSON.stringify({ error: "Route not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
        });
    }
}

const router = new Router();



////////////////////////////////
//                            //
//   Configure routes here    //
//                            //
////////////////////////////////

router.addRoute('/api/dynamicContactDetails', {
    GET: async (request, dbClient, env) => {
        const authenticationResponse = await validateSession(request, env);
        const isAuthenticated = authenticationResponse.status === true; // Check if authenticated
        return await getAllContacts(dbClient, env, isAuthenticated);
    },
    POST: async (request, dbClient, env) => await createContact(request, dbClient, env),
    PUT: async (request, dbClient, env) => {
        const url = new URL(request.url)
        const id = url.searchParams.get('id')
        if (id) {
            return await editContact(id, request, dbClient, env)
        }
        return new Response(JSON.stringify({ error: "Missing id parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        })
    },
    DELETE: async (request, dbClient, env) => {
        const url = new URL(request.url)
        const id = url.searchParams.get('id')
        if (id) {
            return await deleteContact(id, request, dbClient, env)
        }
        return new Response(JSON.stringify({ error: "Missing id parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        })
    }
});

router.addRoute('/api/dynamicContactDetails/activate', {
    PUT: async (request, dbClient, env) => {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');
        if (id) {
            return await activateContact(id, request, dbClient, env);
        }
        return new Response(JSON.stringify({ error: "Missing id parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }
});



//  SECTION FOR BLOG ROUTES
//  SECTION FOR BLOG ROUTES
router.addRoute('/api/get-all-blogs', {
    GET: async (request, dbClient, env) => {
        const authenticationResponse = await validateSession(request, env);
        if (!authenticationResponse.status) {
            return new Response(JSON.stringify(authenticationResponse), { status: 401 });
        }
        return await getAllBlogs(dbClient, env)
    },
});

router.addRoute('/api/create-blogs', {
    POST: async (request, dbClient, env) => {
        const authenticationResponse = await validateSession(request, env);
        if (!authenticationResponse.status) {
            return new Response(JSON.stringify(authenticationResponse), { status: 401 });
        }
        return await createBlog(request, dbClient, env);
    }
});

router.addRoute('/api/getBlogById/:id', {
    GET: async (request, dbClient, env) => {
        const authenticationResponse = await validateSession(request, env);
        if (!authenticationResponse.status) {
            return new Response(JSON.stringify(authenticationResponse), { status: 401 });
        }
        const { id } = request.params;
        const result = await getBlogById(id, dbClient, env);
        return new Response(result.body, {
            status: result.status,
            headers: result.headers,
        });
    },
});

router.addRoute('/api/createBlog', {
    POST: async (request, dbClient, env) => {
        const authenticationResponse = await validateSession(request, env);
        if (!authenticationResponse.status) {
            return new Response(JSON.stringify(authenticationResponse), { status: 401 });
        }
        return await createBlog(request, dbClient, env);
    },
});

router.addRoute('/api/updateBlog/:id', {
    PUT: async (request, dbClient, env) => {
        const authenticationResponse = await validateSession(request, env);
        if (!authenticationResponse.status) {
            return new Response(JSON.stringify(authenticationResponse), { status: 401 });
        }
        const { id } = request.params;
        return await updateBlog(id, request, dbClient, env);
    },
});

router.addRoute('/api/deleteBlog/:id', {
    DELETE: async (request, dbClient, env) => {
        const authenticationResponse = await validateSession(request, env);
        if (!authenticationResponse.status) {
            return new Response(JSON.stringify(authenticationResponse), { status: 401 });
        }
        const { id } = request.params;
        return await deleteBlog(id, request, dbClient, env);
    },
});
//public routes
router.addRoute('/api/getBlogs', {
    GET: async (request, dbClient, env) => {
        return await getPublishedBlogs(dbClient, env, request);
    },
});

router.addRoute('/api/getBlogs/:id', {
    GET: async (request, dbClient, env) => {
        const { id } = request.params;
        return await getPublishedBlogById(id, dbClient, env);
    },
});

//
//
// PRODUCTS
//
router.addRoute('/api/products', {
    GET: async (request, dbClient, env) => {
        const authenticationResponse = await validateSession(request, env);
        const isAuthenticated = authenticationResponse.status === true; // Check if authenticated
        return await getAllProducts(dbClient, env, isAuthenticated);
    },
    POST: async (request, dbClient, env) => await createProduct(request, dbClient, env),
    PUT: async (request, dbClient, env) => {
        const url = new URL(request.url)
        const product_id = url.searchParams.get('id')
        if (product_id) {
            return await editProduct(request, dbClient, env, product_id)
        }
        return new Response(JSON.stringify({ error: "Missing id parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        })
    },
    DELETE: async (request, dbClient, env) => {
        const url = new URL(request.url)
        const product_id = url.searchParams.get('id')
        if (product_id) {
            return await deleteProduct(dbClient, request, env, product_id)
        }
        return new Response(JSON.stringify({ error: "Missing id parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        })
    }
});


//
//
// BOARD of DIrectors and POPUPS
//
//

// Popup Messages Routes
router.addRoute('/api/popupMessages', {
    GET: async (request, dbClient, env) => await getPopupMessages(request, dbClient, env),
    POST: async (request, dbClient, env) => await createPopupMessage(request, dbClient, env),
    PUT: async (request, dbClient, env) => {
        const url = new URL(request.url);
        const popup_id = url.searchParams.get('id');
        if (popup_id) {
            return await editPopupMessage(request, dbClient, popup_id, env);
        }
        return new Response(JSON.stringify({ error: "Missing id parameter" }), { status: 400 });
    },
    DELETE: async (request, dbClient, env) => {
        const url = new URL(request.url);
        const popup_id = url.searchParams.get('id');
        if (popup_id) {
            return await deletePopupMessage(request, dbClient, popup_id, env);
        }
        return new Response(JSON.stringify({ error: "Missing id parameter" }), { status: 400 });
    }
});

router.addRoute('/api/popupMessages/status', {
    PUT: async (request, dbClient, env) => {
        const url = new URL(request.url);
        const popup_id = url.searchParams.get('id');
        const authenticationResponse = await validateSession(request, env);
        if (!authenticationResponse.status) {
            return new Response(JSON.stringify(authenticationResponse), { status: 401 });
        }
        if (popup_id) {
            return await setPopupActiveStatus(request, dbClient, popup_id);
        }
        return new Response(JSON.stringify({ error: "Missing id parameter" }), { status: 400 });
    }
});

// Director  Definitions
router.addRoute('/api/directors', {
    GET: async (request, dbClient, env) => {
        const authenticationResponse = await validateSession(request, env);
        const isAuthenticated = authenticationResponse.status === true; // Check if authenticated
        return await getAllDirectors(dbClient, env, isAuthenticated); // Pass authentication status
    },
    POST: async (request, dbClient, env) => await createDirector(request, dbClient, env),
    PUT: async (request, dbClient, env) => {
        const url = new URL(request.url)
        const director_id = url.searchParams.get('id')
        if (director_id) {
            return await editDirector(request, dbClient, director_id, env)
        }
        return new Response(JSON.stringify({ error: "Missing id parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        })
    },
    DELETE: async (request, dbClient, env) => {
        const url = new URL(request.url)
        const director_id = url.searchParams.get('id')
        if (director_id) {
            return await deleteDirector(request, dbClient, director_id, env)
        }
        return new Response(JSON.stringify({ error: "Missing id parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        })
    }
});

router.addRoute('/api/directors/status', {
    PUT: async (request, dbClient, env) => {
        const url = new URL(request.url);
        const director_id = url.searchParams.get('id');
        if (director_id) {
            return await setDirectorActiveStatus(request, dbClient, director_id, env);
        }
        return new Response(JSON.stringify({ error: "Missing id parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }
});


// API messages
router.addRoute('/api/message', {
    GET: async (request, dbClient, env) => await getAllMessages(request, dbClient, env), // Get all messages (authenticated)
    POST: async (request, dbClient,ev) => await createMessage(request, dbClient),     // Create a message (unauthenticated)
});

router.addRoute('/api/message/:id', {
    GET: async (request, dbClient, env) => {
        const messageId = parseInt(request.params.id);
        if (isNaN(messageId)) {
            return new Response(JSON.stringify({ error: "Invalid message ID" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        return await getMessageById(request, messageId, dbClient, env);
    },

    PUT: async (request, dbClient, env) => {
        const messageId = parseInt(request.params.id);
        if (isNaN(messageId)) {
            return new Response(JSON.stringify({ error: "Invalid message ID" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        return await updateMessageStatus(request, messageId, dbClient, env);
    },

    DELETE: async (request, dbClient, env) => {
        const messageId = parseInt(request.params.id);
        if (isNaN(messageId)) {
            return new Response(JSON.stringify({ error: "Invalid message ID" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        return await deleteMessageById(request, messageId, dbClient, env);
    },
});

// API suggestions
router.addRoute('/api/suggestion', {
    GET: async (request, dbClient, env) => await getAllSuggestions(request, dbClient, env), // Get all suggestions (authenticated)
    POST: async (request, dbClient) => await createSuggestion(request, dbClient),            // Create a suggestion (unauthenticated)
});

router.addRoute('/api/suggestion/:id', {
    GET: async (request, dbClient, env) => {
        const suggestionId = parseInt(request.params.id);
        if (isNaN(suggestionId)) {
            return new Response(JSON.stringify({ error: "Invalid suggestion ID" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        return await getSuggestionById(request, suggestionId, dbClient, env);
    },

    PUT: async (request, dbClient, env) => {
        const suggestionId = parseInt(request.params.id);
        if (isNaN(suggestionId)) {
            return new Response(JSON.stringify({ error: "Invalid suggestion ID" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        return await updateSuggestionStatus(request, suggestionId, dbClient, env);
    },

    DELETE: async (request, dbClient, env) => {
        const suggestionId = parseInt(request.params.id);
        if (isNaN(suggestionId)) {
            return new Response(JSON.stringify({ error: "Invalid suggestion ID" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        return await deleteSuggestionById(request, suggestionId, dbClient, env);
    },
});



//======================================================
//                                                     ||
//                 PUBLICATIONS                        ||
//                                                     ||
//======================================================


// Route Definitions (Assuming you're using something like Alix Routers)
router.addRoute('/api/publications', {
    GET: async (request, dbClient, env) => await getPublications(request, dbClient, env),
    POST: async (request, dbClient, env) => await createPublication(request, dbClient, env),
    PUT: async (request, dbClient, env) => {
        const url = new URL(request.url);
        const publication_id = url.searchParams.get('id');
        if (publication_id) {
            return await editPublication(request, dbClient, publication_id, env);
        }
        return new Response(JSON.stringify({ error: "Missing id parameter" }), { status: 400 });
    },
    DELETE: async (request, dbClient, env) => {
        const url = new URL(request.url);
        const publication_id = url.searchParams.get('id');
        if (publication_id) {
            return await deletePublication(request, dbClient, publication_id, env);
        }
        return new Response(JSON.stringify({ error: "Missing id parameter" }), { status: 400 });
    }
});

router.addRoute('/api/publications/status', {
    PUT: async (request, dbClient, env) => {
        const url = new URL(request.url);
        const publication_id = url.searchParams.get('id');
        if (publication_id) {
            return await setPublicationActiveStatus(request, dbClient, publication_id, env);
        }
        return new Response(JSON.stringify({ error: "Missing id parameter" }), { status: 400 });
    }
});


// Assuming you have a router object like this
router.addRoute('/api/login', {
    POST: async (request, dbClient, env) => {
        // Call the login function
        return await login(request, dbClient, env);
    }
});

// Check if signup is allowed in the environment configuration
router.addRoute('/api/is-signup-activated', {
    GET: async (request, dbClient, env) => {
        const allowSignup = env.ALLOW_SIGNUP === 'true';
        return new Response(JSON.stringify({ isSignupActivated: allowSignup }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }
});


router.addRoute('/api/signup', {
    POST: async (request, dbClient, env) => {
        const allowSignup = env.ALLOW_SIGNUP === 'true';
        if (allowSignup) {
            console.log(allowSignup);
            return await signup(request, dbClient);
        } else {
            return new Response(JSON.stringify({
                error: "Signup is not allowed."
            }), {
                status: 403,
                headers: { "Content-Type": "application/json" },
            });
        }
    }
});

// In your router.js:
router.addRoute('/api/validate-token', {
    POST: async (request, dbClient, env) => {
        const validationResult = await validateSession(request, env);
        if (validationResult.status) {
            return new Response(JSON.stringify({ message: "Token is valid", user: validationResult.user }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        } else {
            return new Response(JSON.stringify({ error: "Token is invalid", details: validationResult.error }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }
    }
});

// Add media routes
router.addRoute('/api/media', {
    GET: async (request, dbClient, env) => {
        try {
            const authenticationResponse = await validateSession(request, env);
            const isAuthenticated = authenticationResponse.status;
            
            // Allow unauthenticated users to view public media
            if (!isAuthenticated) {
                return await getMedia(request, dbClient, env);
            }
            
            // Authenticated users get full access
            return await getMedia(request, dbClient, env);
        } catch (error) {
            console.error("Error in media GET route:", error);
            return new Response(JSON.stringify({ 
                error: "Failed to fetch media", 
                details: error.message 
            }), { 
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }
    },
    POST: async (request, dbClient, env) => {
        try {
            const authenticationResponse = await validateSession(request, env);
            if (!authenticationResponse.status) {
                return new Response(JSON.stringify(authenticationResponse), { 
                    status: 401,
                    headers: { "Content-Type": "application/json" }
                });
            }
            return await createMedia(request, dbClient, env);
        } catch (error) {
            console.error("Error in media POST route:", error);
            return new Response(JSON.stringify({ 
                error: "Failed to create media", 
                details: error.message 
            }), { 
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }
    }
});

router.addRoute('/api/media/:id', {
    PUT: async (request, dbClient, env) => {
        try {
            const authenticationResponse = await validateSession(request, env);
            if (!authenticationResponse.status) {
                return new Response(JSON.stringify(authenticationResponse), { 
                    status: 401,
                    headers: { "Content-Type": "application/json" }
                });
            }
            const { id } = request.params;
            if (!id) {
                return new Response(JSON.stringify({ 
                    error: "Missing media ID" 
                }), { 
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                });
            }
            return await editMedia(request, dbClient, id, env);
        } catch (error) {
            console.error("Error in media PUT route:", error);
            return new Response(JSON.stringify({ 
                error: "Failed to update media", 
                details: error.message 
            }), { 
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }
    },
    DELETE: async (request, dbClient, env) => {
        try {
            const authenticationResponse = await validateSession(request, env);
            if (!authenticationResponse.status) {
                return new Response(JSON.stringify(authenticationResponse), { 
                    status: 401,
                    headers: { "Content-Type": "application/json" }
                });
            }
            const { id } = request.params;
            if (!id) {
                return new Response(JSON.stringify({ 
                    error: "Missing media ID" 
                }), { 
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                });
            }
            return await deleteMedia(request, dbClient, id, env);
        } catch (error) {
            console.error("Error in media DELETE route:", error);
            return new Response(JSON.stringify({ 
                error: "Failed to delete media", 
                details: error.message 
            }), { 
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }
    }
});

router.addRoute('/api/dashboard-summary', {
    GET: async (request, dbClient, env) => {
        const authenticationResponse = await validateSession(request, env);
        if (!authenticationResponse.status) {
            return new Response(JSON.stringify(authenticationResponse), { status: 401 });
        }
        return await getDashboardSummary(dbClient, env);
    }
});

////////////////////////////////
//                            //
//        Export Them         //
//                            //
////////////////////////////////

module.exports = router;
