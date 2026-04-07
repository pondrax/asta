import { error } from '@sveltejs/kit';

export const load = async ({ locals }) => {
    // Protect the collection management page - restricted to Admin role
    if (locals.user?.role?.name !== 'admin') {
        throw error(403, {
            message: 'Forbidden: You do not have permission to access the Database Collections dashboard.'
        });
    }

    return {
        user: locals.user
    };
};
