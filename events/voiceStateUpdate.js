const { Events } = require('discord.js');

module.exports = {
	name: Events.VoiceStateUpdate,
	async execute() {
		// This event is now mainly for cleanup or other voice state logic
		// The voice channel creation is handled via the /makevoicechannel command
		// and button interactions in interactionCreate.js

		// You can add other voice state logic here if needed in the future
		// For example: auto-delete empty temporary channels, etc.
	},
};