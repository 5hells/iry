import { startBot, registerCommands } from '../src/lib/server/discord/bot';
import 'dotenv/config';

async function main() {
	console.log('🤖 Starting Discord bot...');

	
	try {
		await registerCommands();
		console.log('✅ Slash commands registered');
	} catch (error) {
		console.error('❌ Failed to register commands:', error);
		process.exit(1);
	}

	
	try {
		startBot();
		console.log('✅ Bot started successfully');
	} catch (error) {
		console.error('❌ Failed to start bot:', error);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
