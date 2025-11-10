const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		console.log(`Ready! Logged in as ${client.user.tag}`);

		// Post the voice channel creation embed to the 'create-voice' channel
		const guild = client.guilds.cache.first();
		
		if (!guild) {
			console.log('[VOICE] No guild found');
			return;
		}

		// Find the 'create-voice' text channel
		const createVoiceChannel = guild.channels.cache.find(
			channel => channel.name === 'create-voice' && channel.type === ChannelType.GuildText,
		);

		if (!createVoiceChannel) {
			console.log('[VOICE] create-voice channel not found. Skipping embed post.');
			return;
		}

		// Create the embed
		const embed = new EmbedBuilder()
			.setTitle('🎤 Create Your Voice Channel')
			.setDescription('Click a button below to create a voice channel!')
			.setColor(0x5865F2)
			.addFields(
				{ name: '🎨 Custom Name', value: 'Click "Create Voice Channel" to choose your own channel name!' },
				{ name: '⚡ Quick Create', value: 'Click "Quick Create" to instantly create a channel with your username!' },
			);

		// Create the buttons
		const customButton = new ButtonBuilder()
			.setCustomId('create_voice_channel_general')
			.setLabel('Create Voice Channel')
			.setStyle(ButtonStyle.Primary)
			.setEmoji('🎤');

		const quickButton = new ButtonBuilder()
			.setCustomId('quick_create_voice_channel')
			.setLabel('Quick Create')
			.setStyle(ButtonStyle.Success)
			.setEmoji('⚡');

		const row = new ActionRowBuilder().addComponents(customButton, quickButton);

		try {
			// Send the embed with the button
			await createVoiceChannel.send({
				embeds: [embed],
				components: [row],
			});
			console.log('[VOICE] Posted voice channel creation embed to create-voice channel');
		}
		catch (error) {
			console.error('[VOICE] Error posting embed to create-voice channel:', error);
		}
	},
};