import { createClient } from "@libsql/client";


let localPopupMessages = [
  {
    popup_id: 1,
    title: "Innovative Eco Krishi",
    content: "Empowering sustainable agriculture with innovative solutions.",
    image_name: null,
    alt_text: null,
    start_date: null,
    end_date: null,
    active: 1,
    created_at: new Date().toISOString()
  }
];

const mockClient = {
  execute: async (query, params = []) => {
    console.log("Mock DB Query:", query, "Params:", params);
    const queryStr = query.trim().replace(/\s+/g, ' ');

    if (queryStr.includes("INSERT INTO PopupMessages")) {
      const newId = localPopupMessages.length ? Math.max(...localPopupMessages.map(p => p.popup_id)) + 1 : 1;
      const newPopup = {
        popup_id: newId,
        title: params[0],
        content: params[1],
        image_name: params[2],
        alt_text: params[3],
        start_date: params[4],
        end_date: params[5],
        active: 1,
        created_at: new Date().toISOString()
      };
      localPopupMessages.push(newPopup);
      return { rows: [{ popup_id: newId }] };
    }

    if (queryStr.includes("UPDATE PopupMessages SET active = ?")) {
      const active = params[0];
      const id = params[1];
      const popup = localPopupMessages.find(p => p.popup_id == id);
      if (popup) popup.active = active;
      return { rows: [] };
    }

    if (queryStr.includes("UPDATE PopupMessages")) {
      const id = params[6];
      const popup = localPopupMessages.find(p => p.popup_id == id);
      if (popup) {
        popup.title = params[0];
        popup.content = params[1];
        popup.image_name = params[2];
        popup.alt_text = params[3];
        popup.start_date = params[4];
        popup.end_date = params[5];
      }
      return { rows: [] };
    }

    if (queryStr.includes("SELECT image_name FROM PopupMessages WHERE popup_id = ?")) {
      const id = params[0];
      const popup = localPopupMessages.find(p => p.popup_id == id);
      return { rows: popup ? [{ image_name: popup.image_name }] : [] };
    }

    if (queryStr.includes("DELETE FROM PopupMessages WHERE popup_id = ?")) {
      const id = params[0];
      localPopupMessages = localPopupMessages.filter(p => p.popup_id != id);
      return { rows: [] };
    }

    if (queryStr.includes("SELECT") && queryStr.includes("FROM PopupMessages")) {
      let results = [...localPopupMessages];
      if (queryStr.includes("WHERE active = 1")) {
        results = results.filter(p => p.active === 1);
      }
      results.sort((a, b) => b.popup_id - a.popup_id);
      return { rows: results };
    }

    if (queryStr.includes("SELECT COUNT(*) as total, SUM(active = 1) as active FROM PopupMessages")) {
      const total = localPopupMessages.length;
      const active = localPopupMessages.filter(p => p.active === 1).length;
      return { rows: [{ total, active }] };
    }

    // Default response to satisfy other dashboard stats
    return { rows: [{ total: 0, active: 0, unread: 0 }] };
  }
};

export const getTursoClient = (env) => {
    if (!env.TURSO_URL) {
        console.warn("TURSO_URL not defined. Using in-memory mock database client.");
        return mockClient;
    }
    return createClient({
        url: env.TURSO_URL,
        authToken: env.TURSO_AUTH_TOKEN || "",
    });
};
