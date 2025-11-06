const { Events, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

// Store pending voice channels with their deletion timeouts
// Also track created channels for auto-deletion when empty
const pendingChannels = new Map();
const createdChannels = new Map(); // Tracks all created voice channels for auto-deletion

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		// Handle slash commands
		if (interaction.isChatInputCommand()) {
			const command = interaction.client.commands.get(interaction.commandName);

			if (!command) {
				console.error(`[VOICE] No command matching ${interaction.commandName} was found.`);
				return;
			}

			try {
				await command.execute(interaction);
			}
			catch (error) {
				console.error(`[VOICE] Error executing ${interaction.commandName}`);
				console.error(error);
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({
						content: 'There was an error while executing this command!',
						flags: MessageFlags.Ephemeral,
					});
				}
				else {
					await interaction.reply({
						content: 'There was an error while executing this command!',
						flags: MessageFlags.Ephemeral,
					});
				}
			}
		}
		// Handle button interactions
		else if (interaction.isButton()) {
			if (interaction.customId.startsWith('create_voice_channel_')) {
				// Handle the general voice channel creation button (from /makevoicechannel command)
				if (interaction.customId === 'create_voice_channel_general') {
					// Anyone can use this button - no user restriction
				}
				else {
					// Handle user-specific buttons (if we still have any)
					const userId = interaction.customId.split('_')[3];
					if (interaction.user.id !== userId) {
						await interaction.reply({
							content: 'This button is not for you! Use the general voice channel creation button.',
							flags: MessageFlags.Ephemeral,
						});
						return;
					}
				}

				// Create the modal
				const modal = new ModalBuilder()
					.setCustomId('voice_channel_modal')
					.setTitle('Create Voice Channel');

				// Create the text input
				const channelNameInput = new TextInputBuilder()
					.setCustomId('channel_name_input')
					.setLabel('Channel Name')
					.setStyle(TextInputStyle.Short)
					.setMinLength(1)
					.setMaxLength(100)
					.setPlaceholder('Enter your voice channel name...')
					.setRequired(true);

				// Add the input to an action row
				const actionRow = new ActionRowBuilder().addComponents(channelNameInput);

				// Add the action row to the modal
				modal.addComponents(actionRow);

				// Show the modal
				await interaction.showModal(modal);
			}
		}
		// Handle modal submissions
		else if (interaction.isModalSubmit()) {
			if (interaction.customId === 'voice_channel_modal') {
				const channelName = interaction.fields.getTextInputValue('channel_name_input').trim();
				// Get the first guild the bot is in
				const guild = interaction.client.guilds.cache.first();

				if (!guild) {
					await interaction.reply({
						content: 'Unable to find the server. Please try again later.',
						flags: MessageFlags.Ephemeral,
					});
					return;
				}

				try {
					// Fetch the member from the guild since interaction.member might be null in DM context
					const member = await guild.members.fetch(interaction.user.id);

					if (!member) {
						await interaction.reply({
							content: 'Unable to find you in the server. Please try again later.',
							flags: MessageFlags.Ephemeral,
						});
						return;
					}

					// Find the "Voice channels" category
					const voiceCategory = guild.channels.cache.find(
						channel => channel.name.toLowerCase() === 'voice channels' && channel.type === ChannelType.GuildCategory,
					);

					// Create the new voice channel
					const newChannel = await guild.channels.create({
						name: channelName,
						type: ChannelType.GuildVoice,
						parent: voiceCategory,
						permissionOverwrites: [
							{
								id: member.id,
								allow: [
									PermissionFlagsBits.Connect,
									PermissionFlagsBits.Speak,
									PermissionFlagsBits.ManageChannels,
									PermissionFlagsBits.MoveMembers,
								],
							},
						],
					});

					// Set up a 1-minute timeout to delete the channel if no one joins
					const timeout = setTimeout(async () => {
						try {
							// Check if the channel still exists and is empty
							const channelToCheck = await guild.channels.fetch(newChannel.id).catch(() => null);
							
							if (channelToCheck && channelToCheck.members.size === 0) {
								await channelToCheck.delete('No one joined within 1 minute');
								
								// Send a DM to the creator
								try {
									await member.send(`Your voice channel **${channelName}** was deleted because no one joined it within 1 minute.`);
								}
								catch (dmError) {
									console.log(`[VOICE] Could not DM ${member.user.tag} about channel deletion`);
								}
								
								console.log(`[VOICE] Deleted empty channel "${channelName}" after 1 minute`);
							}
							
							// Clean up the pending channel tracking
							pendingChannels.delete(newChannel.id);
						}
						catch (error) {
							console.error('[VOICE] Error during channel timeout deletion:', error);
							pendingChannels.delete(newChannel.id);
						}
					}, 60000); // 1 minute

					// Store the timeout and creator info
					pendingChannels.set(newChannel.id, {
						timeout: timeout,
						creatorId: member.id,
						channelName: channelName,
					});

					// Also track this channel for auto-deletion when everyone leaves
					createdChannels.set(newChannel.id, {
						creatorId: member.id,
						channelName: channelName,
					});

					// Move the user to the new channel if they're in a voice channel
					if (member.voice.channel) {
						await member.voice.setChannel(newChannel);
					}

					// Reply to the modal submission
					await interaction.reply({
						content: `Channel **${channelName}** created!`,
						flags: MessageFlags.Ephemeral,
					});

					console.log(`[VOICE] Created voice channel "${channelName}" for ${member.user.tag}`);
				}
				catch (error) {
					console.error('[VOICE] Error creating voice channel:', error);
					await interaction.reply({
						content: 'There was an error creating your voice channel. Please try again later.',
						flags: MessageFlags.Ephemeral,
					});
				}
			}
		}
	},
	pendingChannels, // Export the map so voiceStateUpdate can access it
	createdChannels, // Export created channels map
};