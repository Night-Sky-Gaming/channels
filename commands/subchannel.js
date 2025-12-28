const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('subchannel')
		.setDescription('Create a subchannel directly below your current voice channel')
		.addStringOption(option =>
			option
				.setName('channel_name')
				.setDescription('The name for the subchannel')
				.setRequired(true)),
	async execute(interaction) {
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

		const currentChannel = interaction.member.voice.channel;
		const channelId = currentChannel.id;

		// Check if this is a channel they created
		if (!createdChannels.has(channelId)) {
			await interaction.reply({
				content: 'You can only create subchannels under channels that you created!',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const channelData = createdChannels.get(channelId);
		if (channelData.creatorId !== interaction.user.id) {
			await interaction.reply({
				content: 'You can only create subchannels under channels that you created!',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// Get the subchannel name
		const subchannelName = interaction.options.getString('channel_name').trim();

		try {
			// Get the parent category and position of the current channel
			const parentCategory = currentChannel.parent;
			const currentPosition = currentChannel.position;

			// Find the + role for embed permissions
			const plusRole = interaction.guild.roles.cache.find(role => role.name === '+');
			
			// Build permission overwrites
			const permissionOverwrites = [
				{
					id: interaction.user.id,
					allow: [
						PermissionFlagsBits.Connect,
						PermissionFlagsBits.Speak,
						PermissionFlagsBits.ManageChannels,
						PermissionFlagsBits.MoveMembers,
					],
				},
			];
			
			// Add + role permissions if the role exists
			if (plusRole) {
				permissionOverwrites.push({
					id: plusRole.id,
					allow: [
						PermissionFlagsBits.EmbedLinks,
					],
				});
			}

			// Create the new voice subchannel
			const subchannel = await interaction.guild.channels.create({
				name: subchannelName,
				type: ChannelType.GuildVoice,
				parent: parentCategory,
				permissionOverwrites: permissionOverwrites,
			});

			// Move the subchannel to be directly below the current channel
			// Position is the sort order, so we want current position + 1
			await subchannel.setPosition(currentPosition + 1);

			// Track this subchannel for auto-deletion when everyone leaves
			createdChannels.set(subchannel.id, {
				creatorId: interaction.user.id,
				channelName: subchannelName,
				parentChannelId: channelId, // Track the parent channel
			});

			await interaction.reply({
				content: `✅ Subchannel **${subchannelName}** created directly below **${currentChannel.name}**!`,
				flags: MessageFlags.Ephemeral,
			});

			console.log(`[VOICE] Created subchannel "${subchannelName}" below "${currentChannel.name}" for ${interaction.user.tag}`);
		}
		catch (error) {
			console.error('[VOICE] Error creating subchannel:', error);
			await interaction.reply({
				content: 'Failed to create the subchannel. Please try again later.',
				flags: MessageFlags.Ephemeral,
			});
		}
	},
};
