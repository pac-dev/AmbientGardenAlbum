/**
 * Really basic audio mastering functions to apply dynamics compression to a track.
 */

import { path } from './deps.js';

const maxLen = 60 * 8;
const envRate = 0.2;
const response = (x) => 1-Math.pow(1-x,2);
const env2gain = (x) => (x < 0.00001) ? 2 : response(x) / x;
const outBufSamples = 1024;

class Compressor {
	constructor() {
		this.envelope = new Float32Array(maxLen * envRate);
	}
	feedInput(fileIdx, sample) {
		const envIdx = Math.floor(((fileIdx / 2) / 44100) * envRate);
		this.envelope[envIdx] = Math.max(this.envelope[envIdx], Math.abs(sample));
	}
	process() {
		this.gains = this.envelope.map(env2gain);
	}
	getGain(fileIdx) {
		let envPos = ((fileIdx / 2) / 44100) * envRate;
		envPos = Math.max(0, envPos - 0.5);
		const env0 = Math.floor(envPos);
		const env1 = env0 + 1;
		const fract = envPos % 1;
		return this.gains[env0]*(1-fract) + this.gains[env1]*fract;
	}
}

class InTrack {
	constructor(path) {
		const command = new Deno.Command('ffmpeg', {
			args: ['-i', path, '-f', 'f32le', '-channels', '2', '-ar', '44100', '-'],
			stdout: 'piped', stderr: globalThis.verbose ? 'inherit' : 'null'
		});
		const proc = command.spawn();
		this.reader = proc.stdout.getReader();
	}
	async *getSamples() {
		let idx = 0;
		while (true) {
			const readResp = await this.reader.read();
			if (readResp.done) break;
			const rVal = readResp.value;
			const nSamples = rVal.length / 4;
			const view = new Float32Array(rVal.buffer, 0, nSamples);
			for (const sample of view) {
				yield [idx, sample];
				idx++;
			}
		}
	}
}

class OutTrack {
	constructor(path) {
		const ext = path.split('.').at(-1);
		const args = ['-y', '-f', 'f32le', '-channels', '2', '-ar', '44100', '-i', 'pipe:0'];
		if (ext === 'mp3') args.push('-b:a', '192k');
		args.push(path);
		const command = new Deno.Command('ffmpeg', {
			args, stdin: 'piped', stderr: globalThis.verbose ? 'inherit' : 'null'
		});
		this.proc = command.spawn();
		this.writer = this.proc.stdin.getWriter();
		this.outBuf = new Float32Array(outBufSamples);
		this.outView = new Uint8Array(this.outBuf.buffer);
		this.outPos = 0;
	}
	async pushSample(sample) {
		this.outBuf[this.outPos] = sample;
		this.outPos++;
		if (this.outPos >= outBufSamples) {
			await this.writer.write(this.outView);
			this.outPos = 0;
		}
	}
	async close() {
		// consider writing the remaining samples here
		await this.writer.close();
	}
}

export const masterTrack = async (inPath, outPath) => {
	console.log(`Mastering ${path.basename(inPath)}...`);
	Deno.mkdirSync(path.dirname(outPath), { recursive: true });
	const comp = new Compressor();
	const in1 = new InTrack(inPath);
	for await (const [idx, sample] of in1.getSamples()) {
		comp.feedInput(idx, sample);
	}
	comp.process();
	const in2 = new InTrack(inPath);
	const out = new OutTrack(outPath);
	for await (const [idx, sample] of in2.getSamples()) {
		const outSample = sample * comp.getGain(idx);
		await out.pushSample(outSample);
	}
	await out.close();
};