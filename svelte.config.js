let adapter;
try {
	
	const mod = await import('@sveltejs/adapter-node');
	adapter = mod.default;
} catch (err) {
	
	adapter = (opts = {}) => ({
		name: 'noop-adapter',
		adapt() {
			
		}
	});
}

const config = {
	kit: {
		
		version: {
			pollInterval: 0
		},
		adapter: adapter({ out: 'build' })
	},
	vite: {
		ssr: {
			noExternal: [] 
		},
		optimizeDeps: {
			exclude: ['@libsql/client']
		}
	}
};
export default config;
