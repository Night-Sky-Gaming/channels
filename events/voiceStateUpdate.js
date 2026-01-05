const { Events, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
	name: Events.VoiceStateUpdate,
	async execute(oldState, newState) {
		// Get the maps from interactionCreate
		const interactionCreateModule = require('./interactionCreate.js');
		const pendingChannels = interactionCreateModule.pendingChannels;
		const createdChannels = interactionCreateModule.createdChannels;
		const pendingOwnershipTransfers = interactionCreateModule.pendingOwnershipTransfers;

		// Check if a user joined a voice channel
		if (!oldState.channel && newState.channel) {
			const channelId = newState.channel.id;
			
			// If this channel is pending deletion, cancel the timeout
			if (pendingChannels.has(channelId)) {
				const channelData = pendingChannels.get(channelId);
				clearTimeout(channelData.timeout);
				pendingChannels.delete(channelId);
				console.log(`[VOICE] Cancelled deletion timeout for "${channelData.channelName}" - user joined`);
			}
		}

		// Check if a user left a voice channel and the channel is now empty
		if (oldState.channel && oldState.channel.id !== newState.channel?.id) {
			const channelId = oldState.channel.id;
			
			// If this is a created channel and it's now empty, delete it
			if (createdChannels.has(channelId)) {
				// Fetch the channel to get current member count
				try {
					const channel = await oldState.guild.channels.fetch(channelId).catch(() => null);
					
					if (channel && channel.members.size === 0) {
						const channelData = createdChannels.get(channelId);
						
						// Delete the channel
						await channel.delete('All users left the channel');
						
						console.log(`[VOICE] Deleted empty channel "${channelData.channelName}" - everyone left`);
						
						// Clean up tracking
						createdChannels.delete(channelId);
						
						// Also remove from pending channels if it's still there
						if (pendingChannels.has(channelId)) {
							const pendingData = pendingChannels.get(channelId);
							clearTimeout(pendingData.timeout);
							pendingChannels.delete(channelId);
						}

						// Clean up any pending ownership transfers
						if (pendingOwnershipTransfers.has(channelId)) {
							pendingOwnershipTransfers.delete(channelId);
						}
					}
					else if (channel && channel.members.size > 0) {
						// Channel is not empty, check if the owner left or switched channels
						const channelData = createdChannels.get(channelId);
						
						// Check if the user who left was the owner and they're not still in this channel
						if (oldState.member.id === channelData.creatorId && (!newState.channel || newState.channel.id !== channelId)) {
							// Owner left or switched to a different channel but there are still people in the channel
							const action = newState.channel ? 'switched channels from' : 'left';
							console.log(`[VOICE] Channel owner ${action} "${channelData.channelName}" with ${channel.members.size} members remaining`);
							
							// Get the list of remaining members
							const remainingMembers = Array.from(channel.members.values())
								.filter(member => !member.user.bot); // Exclude bots
							
							if (remainingMembers.length > 0) {
								// Create a dropdown menu with the remaining members
								const selectMenu = new StringSelectMenuBuilder()
									.setCustomId(`transfer_ownership_${channelId}`)
									.setPlaceholder('Select the new channel owner')
									.addOptions(
										remainingMembers.map(member => ({
											label: member.user.username,
											description: `Transfer ownership to ${member.user.tag}`,
											value: member.id,
										}))
									);

								const row = new ActionRowBuilder().addComponents(selectMenu);

								const embed = new EmbedBuilder()
									.setTitle('🔄 Channel Ownership Transfer')
									.setDescription(`You left your voice channel **${channelData.channelName}**, but there are still ${remainingMembers.length} member(s) in it.\n\nPlease select a new owner from the dropdown below, or the channel will remain without an owner until everyone leaves.`)
									.setColor(0xFFA500)
									.setTimestamp();

								// Send DM to the old owner
								try {
									await oldState.member.send({
										embeds: [embed],
										components: [row],
									});

									// Track this pending ownership transfer
									pendingOwnershipTransfers.set(channelId, {
										oldOwnerId: channelData.creatorId,
										channelName: channelData.channelName,
									});

									console.log(`[VOICE] Sent ownership transfer DM to ${oldState.member.user.tag}`);
								}
								catch (dmError) {
									console.error(`[VOICE] Could not DM ${oldState.member.user.tag} for ownership transfer:`, dmError);
								}
							}
						}
					}
				}
				catch (error) {
					console.error('[VOICE] Error deleting empty channel:', error);
					createdChannels.delete(channelId);
				}
			}
		}
	},
};