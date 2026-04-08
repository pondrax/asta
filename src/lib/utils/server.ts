import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";

export const checkAdmin = () => {
    const event = getRequestEvent();
    if (event?.locals?.user?.role?.name !== 'admin') {
        throw error(403, 'Forbidden: Admin access only');
    }
}
