const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('voice')
		.setDescription('Manage voice channels')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand(subcommand =>
			subcommand
				.setName('setup')
				.setDescription('Posts the voice channel creation embed'))
		.addSubcommand(subcommand =>
			subcommand
				.setName('name')
				.setDescription('Change the name of your voice channel')
				.addStringOption(option =>
					option
						.setName('channel_name')
						.setDescription('The new name for your channel')
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('reject')
				.setDescription('Block a user from joining your voice channel')
				.addStringOption(option =>
					option
						.setName('username')
						.setDescription('The username to block')
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('limit')
				.setDescription('Set the user limit for your voice channel')
				.addIntegerOption(option =>
					option
						.setName('limit')
						.setDescription('The user limit (0 for no limit)')
						.setRequired(true)
						.setMinValue(0)
						.setMaxValue(99))),
	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'setup') {
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
		}
		else if (subcommand === 'name') {
			// Get the new channel name
			const newName = interaction.options.getString('channel_name').trim();

			// Get the maps from interactionCreate
			const interactionCreateModule = require('../events/interactionCreate.js');
			const createdChannels = interactionCreateModule.createdChannels;

			// Check if user is in a voice channel
			if (!interaction.member.voice.channel) {
				await interaction.reply({
					content: 'You must be in a voice channel to use this command!',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const channelId = interaction.member.voice.channel.id;

			// Check if this is a channel they created
			if (!createdChannels.has(channelId)) {
				await interaction.reply({
					content: 'You can only rename channels that you created!',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const channelData = createdChannels.get(channelId);
			if (channelData.creatorId !== interaction.user.id) {
				await interaction.reply({
					content: 'You can only rename channels that you created!',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			try {
				await interaction.member.voice.channel.setName(newName);
				channelData.channelName = newName;
				await interaction.reply({
					content: `Channel renamed to **${newName}**!`,
					flags: MessageFlags.Ephemeral,
				});
			}
			catch (error) {
				console.error('[VOICE] Error renaming channel:', error);
				await interaction.reply({
					content: 'Failed to rename the channel. Please try again later.',
					flags: MessageFlags.Ephemeral,
				});
			}
		}
		else if (subcommand === 'reject') {
			// Defer the reply since searching members can take time
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			// Get the username to block
			const username = interaction.options.getString('username').trim();

			// Get the maps from interactionCreate
			const interactionCreateModule = require('../events/interactionCreate.js');
			const createdChannels = interactionCreateModule.createdChannels;

			// Check if user is in a voice channel
			if (!interaction.member.voice.channel) {
				await interaction.editReply({
					content: 'You must be in a voice channel to use this command!',
				});
				return;
			}

			const channelId = interaction.member.voice.channel.id;

			// Check if this is a channel they created
			if (!createdChannels.has(channelId)) {
				await interaction.editReply({
					content: 'You can only reject users from channels that you created!',
				});
				return;
			}

			const channelData = createdChannels.get(channelId);
			if (channelData.creatorId !== interaction.user.id) {
				await interaction.editReply({
					content: 'You can only reject users from channels that you created!',
				});
				return;
			}

			try {
				// Search for the user by username - fetch with query to be more efficient
				const members = await interaction.guild.members.fetch({ query: username, limit: 10 });
				
				// If no results with query, try cache
				let targetMember = members.first();
				
				if (!targetMember) {
					// Try searching in cache as fallback
					targetMember = interaction.guild.members.cache.find(member => 
						member.user.username.toLowerCase().includes(username.toLowerCase()) ||
						member.user.tag.toLowerCase().includes(username.toLowerCase()) ||
						(member.nickname && member.nickname.toLowerCase().includes(username.toLowerCase()))
					);
				}

				if (!targetMember) {
					await interaction.editReply({
						content: `Could not find a user matching "${username}". Try being more specific!`,
					});
					return;
				}

				// Don't allow blocking yourself
				if (targetMember.id === interaction.user.id) {
					await interaction.editReply({
						content: 'You cannot block yourself from your own channel!',
					});
					return;
				}

				// Update channel permissions to deny the user from connecting
				await interaction.member.voice.channel.permissionOverwrites.create(targetMember.id, {
					Connect: false,
				});

				// If the user is currently in the channel, disconnect them
				if (targetMember.voice.channel?.id === channelId) {
					await targetMember.voice.disconnect('Blocked by channel owner');
				}

				await interaction.editReply({
					content: `Blocked **${targetMember.user.tag}** from joining your channel!`,
				});
			}
			catch (error) {
				console.error('[VOICE] Error blocking user:', error);
				await interaction.editReply({
					content: 'Failed to block the user. Please try again later.',
				});
			}
		}
		else if (subcommand === 'limit') {
			// Get the user limit
			const limit = interaction.options.getInteger('limit');

			// Get the maps from interactionCreate
			const interactionCreateModule = require('../events/interactionCreate.js');
			const createdChannels = interactionCreateModule.createdChannels;

			// Check if user is in a voice channel
			if (!interaction.member.voice.channel) {
				await interaction.reply({
					content: 'You must be in a voice channel to use this command!',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const channelId = interaction.member.voice.channel.id;

			// Check if this is a channel they created
			if (!createdChannels.has(channelId)) {
				await interaction.reply({
					content: 'You can only set limits on channels that you created!',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const channelData = createdChannels.get(channelId);
			if (channelData.creatorId !== interaction.user.id) {
				await interaction.reply({
					content: 'You can only set limits on channels that you created!',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			try {
				await interaction.member.voice.channel.setUserLimit(limit);
				const limitText = limit === 0 ? 'No limit' : `${limit} users`;
				await interaction.reply({
					content: `Channel user limit set to **${limitText}**!`,
					flags: MessageFlags.Ephemeral,
				});
			}
			catch (error) {
				console.error('[VOICE] Error setting user limit:', error);
				await interaction.reply({
					content: 'Failed to set the user limit. Please try again later.',
					flags: MessageFlags.Ephemeral,
				});
			}
		}
	},
};