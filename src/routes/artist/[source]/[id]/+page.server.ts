import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { source, id } = params;

	try {
		const response = await fetch(`/api/artist/${source}/${id}`);

		if (!response.ok) {
			if (response.status === 404) {
				throw error(404, 'Artist not found');
			}
			throw error(response.status, 'Failed to load artist');
		}

		const data = await response.json();
		let reviews: any[] = [];

		if (data?.artist?.id) {
			const reviewsResponse = await fetch(
				`/api/reviews/artist?artistId=${encodeURIComponent(data.artist.id)}`
			);
			if (reviewsResponse.ok) {
				const reviewsData = await reviewsResponse.json();
				reviews = reviewsData?.reviews || [];
			}
		}

		return {
			artist: data.artist,
			releases: data.releases || [],
			reviews
		};
	} catch (err) {
		console.error('Error loading artist page:', err);
		throw error(err.status || 500, err.message || 'Failed to load artist');
	}
};
