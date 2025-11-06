const { Events } = require('discord.js');

module.exports = {
	name: Events.VoiceStateUpdate,
	async execute(oldState, newState) {
		// Get the maps from interactionCreate
		const interactionCreateModule = require('./interactionCreate.js');
		const pendingChannels = interactionCreateModule.pendingChannels;
		const createdChannels = interactionCreateModule.createdChannels;

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
						
						// Send a DM to the creator
						try {
							const creator = await oldState.guild.members.fetch(channelData.creatorId);
							await creator.send(`Your voice channel **${channelData.channelName}** was deleted because everyone left.`);
						}
						catch (dmError) {
							console.log(`[VOICE] Could not DM creator about channel deletion (everyone left)`);
						}
						
						console.log(`[VOICE] Deleted empty channel "${channelData.channelName}" - everyone left`);
						
						// Clean up tracking
						createdChannels.delete(channelId);
						
						// Also remove from pending channels if it's still there
						if (pendingChannels.has(channelId)) {
							const pendingData = pendingChannels.get(channelId);
							clearTimeout(pendingData.timeout);
							pendingChannels.delete(channelId);
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