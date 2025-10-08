const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('voice')
		.setDescription('Posts the voice channel creation embed')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		// Create an embed for the voice channel creation
		const embed = new EmbedBuilder()
			.setTitle('🎤 Create Your Voice Channel')
			.setDescription('Click the button below to create a custom voice channel with your chosen name!')
			.setColor(0x5865F2)
			.addFields(
				{ name: 'How it works:', value: '1. Click the button\n2. Enter your channel name\n3. Your new channel gets created!' },
			);

		// Create a button for voice channel creation
		const button = new ButtonBuilder()
			.setCustomId('create_voice_channel_general')
			.setLabel('Create Voice Channel')
			.setStyle(ButtonStyle.Primary)
			.setEmoji('🎤');

		const row = new ActionRowBuilder().addComponents(button);

		// Send the embed with the button
		await interaction.reply({
			embeds: [embed],
			components: [row],
		});
	},
};