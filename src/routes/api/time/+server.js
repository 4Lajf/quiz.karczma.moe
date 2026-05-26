import { json } from '@sveltejs/kit';

export const GET = () => {
	return json({
		serverNow: Date.now()
	});
};
