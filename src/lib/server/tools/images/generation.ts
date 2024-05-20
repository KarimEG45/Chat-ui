import type { BackendTool } from "..";
import { uploadFile } from "../../files/uploadFile";
import { ToolResultStatus } from "$lib/types/Tool";
import { MessageUpdateType } from "$lib/types/MessageUpdate";
import { callSpace, type GradioImage } from "../utils";

type ImageGenerationInput = [
	number /* number (numeric value between 1 and 8) in 'Number of Images' Slider component */,
	number /* number in 'Image Height' Number component */,
	number /* number in 'Image Width' Number component */,
	string /* prompt */,
	number /* seed random */
];
type ImageGenerationOutput = [{ image: GradioImage }[]];

const imageGeneration: BackendTool = {
	name: "image-generation",
	displayName: "Image Generation",
	description: "Use this tool to generate an image from a prompt.",
	isOnByDefault: true,
	parameterDefinitions: {
		prompt: {
			description:
				"A prompt to generate an image from. Describe the image visually in simple terms, separate terms with a comma.",
			type: "string",
			required: true,
		},
		numberOfImages: {
			description: "Number of images to generate, between 1 and 8.",
			type: "number",
			required: false,
			default: 1,
		},
		width: {
			description: "Width of the generated image.",
			type: "number",
			required: false,
			default: 1024,
		},
		height: {
			description: "Height of the generated image.",
			type: "number",
			required: false,
			default: 1024,
		},
	},
	async *call({ prompt, numberOfImages }, { conv }) {
		const outputs = await callSpace<ImageGenerationInput, ImageGenerationOutput>(
			"ByteDance/Hyper-SDXL-1Step-T2I",
			"/process_image",
			[
				Number(numberOfImages), // number (numeric value between 1 and 8) in 'Number of Images' Slider component
				512, // number in 'Image Height' Number component
				512, // number in 'Image Width' Number component
				prompt, // prompt
				Math.floor(Math.random() * 1000), // seed random
			]
		);
		const imageBlobs = await Promise.all(
			outputs[0].map((output) =>
				fetch(output.image.url)
					.then((res) => res.blob())
					.then((blob) => uploadFile(blob, conv))
			)
		);

		for (const image of imageBlobs) {
			yield { type: MessageUpdateType.File, sha: image.value, mime: image.mime };
		}

		return {
			status: ToolResultStatus.Success,
			outputs: [
				{
					imageGeneration: `An image has been generated for the following prompt: "${prompt}". Answer as if the user can already see the image. Do not try to insert the image or to add space for it. The user can already see the image. Do not try to describe the image as you the model cannot see it.`,
				},
			],
			display: false,
		};
	},
};

export default imageGeneration;
