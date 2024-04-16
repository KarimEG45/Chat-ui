import { error } from "@sveltejs/kit";
import { collections } from "../database";
import type { Conversation } from "$lib/types/Conversation";
import type { SharedConversation } from "$lib/types/SharedConversation";
import type { MessageFile } from "$lib/types/Message";

export async function downloadFile(
	sha256: string,
	convId: Conversation["_id"] | SharedConversation["_id"]
): Promise<MessageFile & { type: "base64" }> {
	const fileId = collections.bucket.find({ filename: `${convId.toString()}-${sha256}` });
	let mime = "";

	const buffer = await fileId.next().then(async (file) => {
		if (!file) {
			throw error(404, "File not found");
		}
		if (file.metadata?.conversation !== convId.toString()) {
			throw error(403, "You don't have access to this file.");
		}

		mime = file.metadata?.mime;

		const fileStream = collections.bucket.openDownloadStream(file._id);

		const fileBuffer = await new Promise<Buffer>((resolve, reject) => {
			const chunks: Uint8Array[] = [];
			fileStream.on("data", (chunk) => chunks.push(chunk));
			fileStream.on("error", reject);
			fileStream.on("end", () => resolve(Buffer.concat(chunks)));
		});

		return fileBuffer;
	});

	return { type: "base64", value: buffer.toString("base64"), mime };
}
