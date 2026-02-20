
const CANVAS_API_ENDPOINTS = [
	'https://api.spotifycanvas.com',
	'http://localhost:3000' 
];

interface CanvasData {
	canvasesList: Array<{
		id: string;
		canvasUrl: string;
		trackUri: string;
		artist: {
			artistUri: string;
			artistName: string;
			artistImgUrl: string;
		};
	}>;
}

export async function getCanvasUrl(trackId: string): Promise<string | null> {
	try {
		for (const endpoint of CANVAS_API_ENDPOINTS) {
			try {
				const url = `${endpoint}/api/canvas?trackId=${trackId}`;
				const response = await fetch(url, {
					headers: {
						Accept: 'application/json'
					}
				});

				if (response.ok) {
					const data: any = await response.json();

					const canvasesList = data.canvasesList || data.data?.canvasesList;
					const canvas = Array.isArray(canvasesList) ? canvasesList[0] : null;
					if (canvas?.canvasUrl) {
						return canvas.canvasUrl;
					}
				}
			} catch (error) {
				continue;
			}
		}

		return null;
	} catch (error) {
		console.error('Failed to fetch canvas URL:', error);
		return null;
	}
}

export async function getCanvasUrls(trackIds: string[]): Promise<Map<string, string>> {
	const canvases = new Map<string, string>();

	const results = await Promise.all(
		trackIds.map(async (id, index) => {
			await new Promise((resolve) => setTimeout(resolve, index * 50));
			const url = await getCanvasUrl(id);
			return { id, url };
		})
	);

	for (const { id, url } of results) {
		if (url) {
			canvases.set(id, url);
		}
	}

	return canvases;
}
