/**
 * Functions for overlapping tracks together. The goal is to take out the end of
 * each track, and mix it into the beginning of the next track.
 * 
 * For example, to overlap track_1 and track_2, the script first determines the
 * length of track_1 and subtracts the transition time from that length.
 * Assuming the resulting length is 42 seconds, the script first executes this
 * command to mix one end into another start:
 * 
 * ffmpeg -ss 42 -i track_1_in.wav -i track_2_in.wav -filter_complex \
 *      amix=inputs=2:duration=longest:dropout_transition=999999,volume=2 \
 *      track_2_out.wav
 * 
 * Then executes this to cut off the end, which is now in the next track:
 * 
 * ffmpeg -i track_1_in.wav -t 42 track_1_out.wav
 * 
 * "999999" is a hack to disable ffmpeg's mixing normalization. This could be
 * avoided by using the new normalize=false instead of dropout_transition and
 * volume, but I don't mind a small hack to support older versions of ffmpeg
 * that are still widespread.
 */

import { path } from './deps.js';

const getDuration = async (inPath) => {
	const command = new Deno.Command('ffmpeg', { args: ['-i', inPath], stderr: 'piped' });
	const { stderr } = await command.output();
	const errText = new TextDecoder().decode(stderr);
	const durationRegex = /Duration: (?<hr>\d\d):(?<min>\d\d):(?<sec>\d\d\.\d\d)/;
	const match = durationRegex.exec(errText);
	if (!match) throw new Error(`Could not extract duration from ${inPath}.\nffmpeg output:\n` + errText);
	return parseFloat(match.groups['hr'])*60*60 + parseFloat(match.groups['min'])*60 + parseFloat(match.groups['sec']);
};

const mixTail = async (inPath1, inPath2, outPath, delay1) => {
	console.log(`mixing end of ${path.basename(inPath1)} into beginning of ${path.basename(inPath2)}`)
	const command = new Deno.Command('ffmpeg', { args: [
		'-ss', delay1, '-i', inPath1, '-i', inPath2,
		'-filter_complex', 'amix=inputs=2:duration=longest:dropout_transition=999999,volume=2',
		outPath
	], stderr: globalThis.verbose ? 'inherit' : 'null' });
	const { code } = await command.output();
	if (code) throw new Error(`ffmpeg error overlapping tracks: ${inPath1} + ${inPath2} -> ${outPath}`);
};

const trimTail = async (inPath, outPath, length) => {
	console.log(`trimming end of ${path.basename(inPath)}`)
	const command = new Deno.Command('ffmpeg', { args: [
		'-i', inPath, '-t', length, outPath
	], stderr: globalThis.verbose ? 'inherit' : 'null' });
	const { code } = await command.output();
	if (code) throw new Error(`ffmpeg error trimming track: ${inPath} -> ${outPath}`);
};

const sep = path.SEPARATOR;

export const overlapAlbum = async (inDir, stageDir, outDir, overlap=8) => {
	if (!inDir.endsWith(sep)) inDir += sep;
	if (!stageDir.endsWith(sep)) stageDir += sep;
	if (!outDir.endsWith(sep)) outDir += sep;
	Deno.mkdirSync(stageDir, { recursive: true });
	Deno.mkdirSync(outDir, { recursive: true });
	const inNames = [...Deno.readDirSync(inDir)]
		.filter(f => f.name.endsWith('.wav'))
		.map(f => f.name)
		.sort();
	const lengths = [];
	for (const name of inNames) lengths.push((await getDuration(inDir + name)) - overlap);
	for (const [idx, name] of inNames.entries()) {
		if (idx) await mixTail(inDir + inNames[idx-1], inDir + name, stageDir + name, lengths[idx-1]);
		else Deno.copyFileSync(inDir + name, stageDir + name);
	}
	const stageNames = [...Deno.readDirSync(stageDir)]
		.filter(f => f.name.endsWith('.wav'))
		.map(f => f.name)
		.sort();
	for (const [idx, name] of stageNames.entries()) {
		const next = stageNames[idx+1];
		if (next) await trimTail(stageDir + name, outDir + name, lengths[idx]);
		else Deno.copyFileSync(stageDir + name, outDir + name);
	}
};