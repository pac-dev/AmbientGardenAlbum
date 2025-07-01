import { parse, path, existsSync, renderMacro, createCanvas } from './Scripts/deps.js';
import { masterTrack } from './Scripts/mastering.js';
import { overlapAlbum } from './Scripts/overlap.js';
import { drawCover, pxWidth, pxHeight } from './Scripts/cover.js';

const helpText = `
Script to render the ambient.garden album. Requires deno and ffmpeg.
All subcommands can take an optional --verbose flag, which mainly shows
ffmpeg output.

SUBCOMMAND: ALBUM
-----------------
Render the entire album, including cover art, to Generated/final/
Usage: deno run -A render.js album [--format=fmt] [--partial] [--ffargs ...]
Arguments:
    --format=fmt    final audio format (wav, mp3, flac...)
    --partial       keep existing rendered tracks
    --ffargs ...    all arguments after this will be passed to ffmpeg
Example 1: deno run -A render.js album
    Uses default settings, rendering the album as 290k mp3.
Example 2: deno run -A render.js album --format=mp3 --ffargs -b:a 200k
    Renders the album at a bitrate of 200k.

SUBCOMMAND: TRACK
-----------------
Render a single track to a wav file. Track names are in MusicSource/tracks/
Usage:    deno run -A render.js track <trackname> <outfile.wav>
Example:  deno run -A render.js track "06. occultation" test.wav
    Renders the 6th track to test.wav

SUBCOMMAND: MASTER-TRACK
------------------------
Master a single audio file, applying dynamics compression.
Usage: deno run -A render.js master-track <infile.wav> <outfile.wav>

SUBCOMMAND: OVERLAP-ALBUM
-------------------------
Add overlap between separately rendered audio tracks.
Usage:    deno run -A render.js overlap <indir> <stagedir> <outdir>
Example:  deno run -A render.js overlap stage2/ stage3/ stage4/

SUBCOMMAND: ENCODE
------------------
Encode and add metadata to rendered tracks.
Usage:    deno run -A render.js encode <indir> <outdir> [--format=fmt] [--ffargs ...]
Arguments:
    --format=fmt    final audio format (wav, mp3, flac...)
    --ffargs ...    all arguments after this will be passed to ffmpeg
Example:  deno run -A render.js encode stage4/ final/ --ffargs -b:a 200k
    Encodes the album at a bitrate of 200k.

SUBCOMMAND: COVER
-----------------
Generate the cover art to a png file.
Usage: deno run -A render.js cover <outfile> [--scale=N]
Example:  deno run -A render.js cover test.png --scale=2
    Generates the cover to test.png at 2x size.
`;

const albumMetadata = {
	'artist': 'Pure Code',
	'album': 'A Walk Though the Ambient Garden',
	'date': '20240301'
};

const helpAndExit = () => {
	console.log(helpText);
	Deno.exit();
};

const moduleDir = path.dirname(path.fromFileUrl(import.meta.url));
const patchDir = path.join(moduleDir, 'MusicSource', 'patches');
const macroDir = path.join(moduleDir, 'MusicSource', 'tracks');
const stage1Dir = path.join(moduleDir, 'Generated', 'stage1'); // rendered
const stage2Dir = path.join(moduleDir, 'Generated', 'stage2'); // mastered
const stage3Dir = path.join(moduleDir, 'Generated', 'stage3'); // overlap start
const stage4Dir = path.join(moduleDir, 'Generated', 'stage4'); // overlap end
const finalDir = path.join(moduleDir, 'Generated', 'final');

const renderTrack = async (trackName, destPath) => {
	const trackPath = path.join(macroDir, trackName+'.tmac');
	Deno.mkdirSync(path.dirname(destPath), { recursive: true });
	await renderMacro(patchDir, trackPath, destPath);
	return destPath;
};

const encodeTrack = async (inPath, outPath, metadata, ffargs) => {
	console.log(`Encoding ${path.basename(inPath)}...`);
	const metaList = Object.entries(metadata)
		.map(([key, val]) => ['-metadata', `${key}=${val}`])
		.flat();
	// console.dir(['-i', inPath, ...ffargs, ...metaList, outPath]);
	const command = new Deno.Command('ffmpeg', { args: [
		'-i', inPath, ...ffargs, ...metaList, outPath
	], stderr: globalThis.verbose ? 'inherit' : 'null' });
	const { code } = await command.output();
	if (code) throw new Error(`ffmpeg error encoding track: ${inPath} -> ${outPath}`);
};

const encodeAlbum = async (inDir, outDir, format='mp3', ffargs=[], cover='') => {
	Deno.mkdirSync(outDir, { recursive: true });
	const coverArgs = cover ? [
		'-i', cover, '-map', '0:0', '-map', '1:0',
		'-metadata:s:v','title="Album cover"', '-metadata:s:v', 'comment="Cover (front)"'
	] : [];
	ffargs = [...coverArgs, ...ffargs];
	const fileNames = [...Deno.readDirSync(inDir)].map(f => f.name).sort();
	for (const [idx, fileName] of fileNames.entries()) {
		const title = fileName.replace(/\.wav$/, '').replace(/^\d+\.\s?/, '');
		const inPath = path.join(inDir, fileName);
		const outPath = path.join(outDir, fileName.replace(/wav$/, format));
		const metaMap = Object.assign({ title, track: idx+1 }, albumMetadata);
		await encodeTrack(inPath, outPath, metaMap, ffargs);
	}
};

const renderAlbum = async (format='mp3', ffargs=['-b:a', '290k'], partial=false) => {
	const toDelete = partial ? [] : [stage1Dir, stage2Dir];
	toDelete.push(stage3Dir, stage4Dir, finalDir);
	console.log('The following intermediate directories will be deleted if they exist:\n'
		+ toDelete.join('\n')
	);
	const answer = prompt('Delete? (y/n)');
	if (! 'yY'.includes(answer)) Deno.exit();
	toDelete.filter(existsSync).forEach(d => Deno.removeSync(d, { recursive: true }));
	const trackNames = [...Deno.readDirSync(macroDir)]
		.filter(f => f.name.endsWith('.tmac'))
		.map(f => f.name.slice(0, -5))
		.sort();
	console.log(`\nRendering tracks to "${stage1Dir}"...`);
	for (const name of trackNames) {
		const outPath = path.join(stage1Dir, name+'.wav');
		if (partial && existsSync(outPath)) {
			console.log('skipping existing: '+name);
			continue;
		}
		await renderTrack(name, outPath);
	}
	console.log(`\nMastering tracks to "${stage2Dir}"...`);
	for (const name of trackNames) {
		const outPath = path.join(stage2Dir, name+'.wav');
		if (partial && existsSync(outPath)) {
			console.log('skipping existing: '+name);
			continue;
		}
		await masterTrack(path.join(stage1Dir, name+'.wav'), outPath);
	}
	console.log(`\nOverlapping tracks to "${stage4Dir}"...`);
	await overlapAlbum(stage2Dir, stage3Dir, stage4Dir);
	console.log(`\nRendering cover art to "${finalDir}"...`);
	const coverPath = path.join(finalDir, 'cover.png');
	await renderCover(coverPath);
	console.log(`\nEncoding tracks to "${finalDir}"...`);
	console.log(`\nAdding metadata: "${JSON.stringify(albumMetadata, null, '  ')}"`);
	await encodeAlbum(stage4Dir, finalDir, format, ffargs, coverPath);
	console.log(`\nDone.`);
};

const renderCover = async (outPath, scale=1) => {
	Deno.mkdirSync(path.dirname(outPath), { recursive: true });
	const canvas = createCanvas(pxWidth*scale, pxHeight*scale);
	const font = await Deno.readFile('Scripts/CourierPrime-Subset.ttf');
	canvas.loadFont(font, { family: 'Courier Prime Regular' });
	const ctx = canvas.getContext('2d');
	ctx.scale(scale,scale);
	drawCover(ctx);
	await Deno.writeFile(outPath, canvas.toBuffer());
};

const runCommandLine = async () => {
	const ffstart = Deno.args.indexOf('--ffargs');
	const ffargs = (ffstart === -1) ? [] : Deno.args.slice(ffstart+1);
	const args = parse(Deno.args);
	const format = args['format'] ?? 'mp3';
	globalThis.verbose = args['verbose'];
	const partial = args['partial'];
	switch (args._[0]) {
		case 'album':
			return await renderAlbum(format, ffargs, partial);
		case 'track':
			return await renderTrack(args._[1], args._[2]);
		case 'master-track':
			return await masterTrack(args._[1], args._[2]);
		case 'overlap-album':
			return await overlapTracks(args._[1], args._[2], args._[3]);
		case 'cover': {
			const scale = args['scale'] ?? 1;
			return await renderCover(args._[1], scale);
		} case 'encode':
		default:
			return helpAndExit();
	}
};

if (import.meta.main) await runCommandLine();