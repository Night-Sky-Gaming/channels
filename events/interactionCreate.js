const { Events, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

// Store pending voice channels with their deletion timeouts
// Also track created channels for auto-deletion when empty
const pendingChannels = new Map();
const createdChannels = new Map(); // Tracks all created voice channels for auto-deletion
const pendingOwnershipTransfers = new Map(); // Tracks ownership transfers when owner leaves

// Helper function to check if user already owns a channel
async function getUserExistingChannel(guild, userId) {
	// Find any existing channels owned by this user
	for (const [channelId, channelData] of createdChannels.entries()) {
		if (channelData.creatorId === userId) {
			try {
				const existingChannel = await guild.channels.fetch(channelId).catch(() => null);
				if (existingChannel) {
					return existingChannel;
				}
				else {
					// Channel doesn't exist anymore, clean up
					createdChannels.delete(channelId);
					if (pendingChannels.has(channelId)) {
						const pendingData = pendingChannels.get(channelId);
						clearTimeout(pendingData.timeout);
						pendingChannels.delete(channelId);
					}
				}
			}
			catch (error) {
				console.error('[VOICE] Error checking existing channel:', error);
			}
		}
	}
	return null;
}

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		// Handle autocomplete interactions
		if (interaction.isAutocomplete()) {
			const command = interaction.client.commands.get(interaction.commandName);

			if (!command || !command.autocomplete) {
				return;
			}

			try {
				await command.autocomplete(interaction);
			}
			catch (error) {
				console.error('[VOICE] Error handling autocomplete:', error);
			}
			return;
		}

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
			if (interaction.customId.startsWith('create_voice_channel_') || interaction.customId === 'quick_create_voice_channel') {
				// Handle quick create button
				if (interaction.customId === 'quick_create_voice_channel') {
					const guild = await interaction.client.guilds.fetch('1430038605518077964').catch(() => null);

					if (!guild) {
						await interaction.reply({
							content: 'Unable to find the server. Please try again later.',
							flags: MessageFlags.Ephemeral,
						});
						return;
					}

					try {
						const member = await guild.members.fetch(interaction.user.id);

						if (!member) {
							await interaction.reply({
								content: 'Unable to find you in the server. Please try again later.',
								flags: MessageFlags.Ephemeral,
							});
							return;
						}

						const channelName = `${member.user.username}'s channel`;

						// Check if user already owns a channel
						const existingChannel = await getUserExistingChannel(guild, member.id);
						if (existingChannel) {
							await interaction.reply({
								content: `You already own a voice channel: ${existingChannel.toString()}\nYou cannot create a new channel until your existing one is deleted.`,
								flags: MessageFlags.Ephemeral,
							});
							return;
						}

					// Find the "Voice channels" category
					const voiceCategory = await guild.channels.fetch('1434238861994627132').catch(() => null);

				// Find the + role for embed permissions
				const plusRole = guild.roles.cache.find(role => role.name === '+');
				
				// Build permission overwrites
				const permissionOverwrites = [
					{
						id: member.id,
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

				// Create the new voice channel
				const newChannel = await guild.channels.create({
						name: channelName,
						type: ChannelType.GuildVoice,
						parent: voiceCategory,
						permissionOverwrites: permissionOverwrites,
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

						// Reply to the button click with a link to the channel
						await interaction.reply({
							content: `Channel **${channelName}** created! ${newChannel.toString()}`,
							flags: MessageFlags.Ephemeral,
						});

						console.log(`[VOICE] Quick created voice channel "${channelName}" for ${member.user.tag}`);
					}
					catch (error) {
						console.error('[VOICE] Error quick creating voice channel:', error);
						await interaction.reply({
							content: 'There was an error creating your voice channel. Please try again later.',
							flags: MessageFlags.Ephemeral,
						});
					}
					return;
				}

				// Handle the general voice channel creation button (from /voice setup command)
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
		// Handle string select menu interactions
		else if (interaction.isStringSelectMenu()) {
			if (interaction.customId.startsWith('transfer_ownership_')) {
				const channelId = interaction.customId.split('_')[2];
				const newOwnerId = interaction.values[0];

				// Check if this transfer is still pending
				if (!pendingOwnershipTransfers.has(channelId)) {
					await interaction.reply({
						content: 'This ownership transfer is no longer valid.',
						flags: MessageFlags.Ephemeral,
					});
					return;
				}

				const transferData = pendingOwnershipTransfers.get(channelId);

				// Verify the person selecting is the old owner
				if (interaction.user.id !== transferData.oldOwnerId) {
					await interaction.reply({
						content: 'Only the previous channel owner can transfer ownership.',
						flags: MessageFlags.Ephemeral,
					});
					return;
				}

				// Check if the channel still exists
				const guild = await interaction.client.guilds.fetch('1430038605518077964').catch(() => null);
				if (!guild) {
					await interaction.reply({
						content: 'Unable to find the server.',
						flags: MessageFlags.Ephemeral,
					});
					return;
				}

				const channel = await guild.channels.fetch(channelId).catch(() => null);
				if (!channel) {
					await interaction.reply({
						content: 'This channel no longer exists.',
						flags: MessageFlags.Ephemeral,
					});
					pendingOwnershipTransfers.delete(channelId);
					createdChannels.delete(channelId);
					return;
				}

				// Verify the new owner is still in the channel
				const newOwner = await guild.members.fetch(newOwnerId).catch(() => null);
				if (!newOwner) {
					await interaction.reply({
						content: 'The selected user could not be found.',
						flags: MessageFlags.Ephemeral,
					});
					return;
				}

				if (!newOwner.voice.channel || newOwner.voice.channel.id !== channelId) {
					await interaction.reply({
						content: 'The selected user is no longer in the channel.',
						flags: MessageFlags.Ephemeral,
					});
					return;
				}

				try {
					// Update the channel data with the new owner
					if (createdChannels.has(channelId)) {
						const channelData = createdChannels.get(channelId);
						channelData.creatorId = newOwnerId;
						console.log(`[VOICE] Transferred ownership of "${channelData.channelName}" from ${interaction.user.tag} to ${newOwner.user.tag}`);
					}

					// Update channel permissions for the new owner
					await channel.permissionOverwrites.create(newOwnerId, {
						Connect: true,
						Speak: true,
						ManageChannels: true,
						MoveMembers: true,
					});

					// Send DM to the new owner
					try {
						await newOwner.send(`You are now the owner of the voice channel **${transferData.channelName}**! You can use the /voice commands to manage it.`);
					}
					catch (dmError) {
						console.log(`[VOICE] Could not DM ${newOwner.user.tag} about ownership transfer`);
					}

					// Clean up the pending transfer
					pendingOwnershipTransfers.delete(channelId);

					// Update the interaction message
					await interaction.update({
						content: `✅ Successfully transferred ownership of **${transferData.channelName}** to **${newOwner.user.tag}**!`,
						embeds: [],
						components: [],
					});
				}
				catch (error) {
					console.error('[VOICE] Error transferring channel ownership:', error);
					await interaction.reply({
						content: 'There was an error transferring ownership. Please try again.',
						flags: MessageFlags.Ephemeral,
					});
				}
			}
		}
		// Handle modal submissions
		else if (interaction.isModalSubmit()) {
			if (interaction.customId === 'voice_channel_modal') {
				const channelName = interaction.fields.getTextInputValue('channel_name_input').trim();
				// Get the specific guild by ID
				const guild = await interaction.client.guilds.fetch('1430038605518077964').catch(() => null);

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

					// Check if user already owns a channel
					const existingChannel = await getUserExistingChannel(guild, member.id);
					if (existingChannel) {
						await interaction.reply({
							content: `You already own a voice channel: ${existingChannel.toString()}\nYou cannot create a new channel until your existing one is deleted.`,
							flags: MessageFlags.Ephemeral,
						});
						return;
					}

				// Find the "Voice channels" category
				const voiceCategory = await guild.channels.fetch('1434238861994627132').catch(() => null);

				// Find the + role for embed permissions
				const plusRole = guild.roles.cache.find(role => role.name === '+');
				
				// Build permission overwrites
				const permissionOverwrites = [
					{
						id: member.id,
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

				// Create the new voice channel
				const newChannel = await guild.channels.create({
					name: channelName,
					type: ChannelType.GuildVoice,
					parent: voiceCategory,
						permissionOverwrites: permissionOverwrites,
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

					// Reply to the modal submission with a link to the channel
					await interaction.reply({
						content: `Channel **${channelName}** created! ${newChannel.toString()}`,
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
	pendingOwnershipTransfers, // Export pending ownership transfers map
};