import React from "react";

export interface CommandDefinition {
	name: string;
	description: string;
	args: Array<{
		name: string;
		description: string;
		required: boolean;
	}>;
	flags?: Array<{
		name: string;
		description: string;
		required: boolean;
	}>;
	example?: string;
	component: React.ComponentType<any>;
	validate: (
		args: string[],
		flags?: Record<string, any>,
	) => { valid: boolean; error?: string };
}

export interface CommandGroup {
	name: string;
	description: string;
	aliases?: string[];
	commands: Record<string, CommandDefinition>;
}
