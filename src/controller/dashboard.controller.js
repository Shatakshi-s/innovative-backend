export const getDashboardSummary = async (dbClient, env) => {
    try {
        const [blogStats, messageStats, productStats, popupStats, mediaStats, contactStats, boardStats, sectionStats] = await Promise.all([
            dbClient.execute('SELECT COUNT(*) as total, SUM(status = "published") as published, SUM(status = "archived") as archived FROM BlogPosts'),
            dbClient.execute('SELECT COUNT(*) as total, SUM(`read` = 1) as read, SUM(`read` = 0) as unread FROM messages'),
            dbClient.execute('SELECT COUNT(*) as total, SUM(available = 1) as available, SUM(available = 0) as unavailable FROM products'),
            dbClient.execute('SELECT COUNT(*) as total, SUM(active = 1) as active FROM PopupMessages'),
            dbClient.execute('SELECT COUNT(*) as total, SUM(CASE WHEN type = "event" OR type = "youtube" THEN 1 ELSE 0 END) as events, SUM(CASE WHEN type = "gallery" OR type = "image" THEN 1 ELSE 0 END) as galleries, SUM(visible = 1) as visible FROM media'),
            dbClient.execute('SELECT COUNT(*) as total, SUM(status = "active") as active FROM contacts'),
            dbClient.execute('SELECT COUNT(*) as total, SUM(active = 1) as active FROM BoardOfDirectors'),
            dbClient.execute('SELECT COUNT(*) as totalSections FROM BoardSections')
        ]);

        // Log each result to verify execution
        // console.log('Blog Stats:', blogStats);
        // console.log('Message Stats:', messageStats);
        // console.log('Product Stats:', productStats);
        // console.log('Popup Stats:', popupStats);
        // console.log('Media Stats:', mediaStats);
        // console.log('Contact Stats:', contactStats);
        // console.log('Board Stats:', boardStats);
        // console.log('Section Stats:', sectionStats);

        return new Response(JSON.stringify({
            success: true,
            data: {
                blogs: {
                    total: blogStats?.rows[0]?.total || 0,
                    published: blogStats?.rows[0]?.published || 0,
                    archived: blogStats?.rows[0]?.archived || 0
                },
                messages: {
                    total: messageStats?.rows[0]?.total || 0,
                    read: messageStats?.rows[0]?.read || 0,
                    unread: messageStats?.rows[0]?.unread || 0
                },
                products: {
                    total: productStats?.rows[0]?.total || 0,
                    available: productStats?.rows[0]?.available || 0,
                    unavailable: productStats?.rows[0]?.unavailable || 0
                },
                popups: {
                    total: popupStats?.rows[0]?.total || 0,
                    active: popupStats?.rows[0]?.active || 0
                },
                media: {
                    total: mediaStats?.rows[0]?.total || 0,
                    events: mediaStats?.rows[0]?.events || 0,
                    galleries: mediaStats?.rows[0]?.galleries || 0,
                    visible: mediaStats?.rows[0]?.visible || 0
                },
                contacts: {
                    total: contactStats?.rows[0]?.total || 0,
                    active: contactStats?.rows[0]?.active || 0
                },
                boardMembers: {
                    total: boardStats?.rows[0]?.total || 0,
                    active: boardStats?.rows[0]?.active || 0
                },
                sections: {
                    totalSections: sectionStats?.rows[0]?.totalSections || 0
                }
            }
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error retrieving dashboard summary:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to retrieve dashboard summary',
            details: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}; 