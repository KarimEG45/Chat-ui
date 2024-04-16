import type { MessageUpdate } from "./MessageUpdate";
import type { Timestamps } from "./Timestamps";
import type { WebSearch } from "./WebSearch";
import type { v4 } from "uuid";

export type Message = Partial<Timestamps> & {
	from: "user" | "assistant" | "system";
	id: ReturnType<typeof v4>;
	content: string;
	updates?: MessageUpdate[];
	webSearchId?: WebSearch["_id"]; // legacy version
	webSearch?: WebSearch;
	score?: -1 | 0 | 1;
	/**
	 * Either contains the base64 encoded image data or the hash of the file
	 * The client will always use base64, while the server uses the hash
	 * in the typical case
	 */
	files?: MessageFile[];
	interrupted?: boolean;

	// needed for conversation trees
	ancestors?: Message["id"][];

	// goes one level deep
	children?: Message["id"][];
};

export type MessageFile = {
	type: "hash" | "base64";
	value: string;
	mime: string;
};
