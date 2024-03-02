/**
 * Soprano drone based on vocal synthesis. This patch is similar to "sine drone"
 * but using a more advanced synth.
 * 
 * Audio-rate code is written in Faust and can be found in the faust directory.
 * 
 * This file contains sequencing, envelopes, and other control code.
 */

import { Graph, FaustNode, CtrlSine, SampleProcessor, DurSmooth, Gain } from '../../lib/tealib.js';
import { mixFreqs, randomSeed } from '../../lib/math.js';

export const sampleRate = 44100;
const graph = new Graph({ sampleRate });

// Post-processing Faust node
const post = new FaustNode('faust/post.dsp', { preamp: 1 });

// Parameters to control the patch
graph.addParam('preamp', { def: 1 }).connect(post.preamp);
// Frequency centers for the generative chord
const fParam1 = graph.addParam('freq1', { def: '100*4' });
const fParam2 = graph.addParam('freq2', { def: '100*6' });
// Timbral parameters
const slowness = graph.addParam('slowness');
const inertia = graph.addParam('inertia', { max: 60 });
const hiCut = graph.addParam('hicut', {max: 9, def: 9});
const smoothCut = new DurSmooth(inertia);

// Hack: ensure the smoothing node gets processed automatically
hiCut.connect(smoothCut).connect(new Gain(0)).connect(graph.out);
post.connect(graph.out);
const rand = randomSeed();

/**
 * Class for a vocal synth Faust node with additional control-rate processing.
 * Control it by setting the "fTgt" and "pressTgt" properties to the desired
 * frequency and pressure level. Call "ctrl" at control rate and get the output
 * from the Faust node.
 */
export class Soprano extends FaustNode {
	constructor() {
		super('faust/soprano.dsp', {
			f1: 0, noise: 0, saw: 0,
			// highness: 0
		});
		this.freq = 100;
		this.fTgt = 100;
		this.fChange = 100;
		this.press = 0;
		this.pressTgt = 0;
		this.vibNode = new CtrlSine({ phase: rand() });
		this.vibNode
			.connect(new SampleProcessor(v => (1 + v * 0.02) * this.freq))
			.connect(this.f1);
	}
	ctrl(t) {
		// slowness 0 -> df 0.03 ; slowness 1 -> df 0.005
		const fDif = (this.fTgt - this.freq) * (0.03-0.025*slowness.value);
		const fAbs = Math.abs(fDif);

		if (fAbs > this.fChange) this.fChange += (fAbs - this.fChange) * 0.1;
		else this.fChange += (fAbs - this.fChange) * 0.007;
		if (this.fChange > 1) this.fChange = 1;

		if (this.pressTgt > this.press) this.press += (this.pressTgt - this.press) * 0.02;
		else this.press += (this.pressTgt - this.press) * 0.002;

		this.freq += fDif;
		this.vibNode.freq.value = 3 + Math.sqrt(this.fChange) * 4;
		this.vibNode.amp.value = 1 - this.fChange;
		this.noise.value = this.fChange * 0.2 + 0.2;
		this.noise.value *= this.press;
		this.saw.value = (1 - this.fChange) * 0.2 + 0.15;
		this.saw.value *= this.press * this.press;
		// this.highness.value = 1-30/(t*t+30);
	}
	init(freq) {
		this.freq = freq
		this.fTgt = freq
		this.fChange = 1;
	}
}

const sops = [...new Array(10)].map(i => new Soprano());
sops.forEach(s => s.connect(post));

// Generate a set of pitches for the chord
const baseAmp = (freq, i) => 0.6 + 0.4 / (i + 1);
let setFreqs = () => {
	// hacky: make sure the initial call sets the right values
	smoothCut.process([hiCut.value]);
	const mfs = mixFreqs(fParam1.value, fParam2.value, 3);
	if (mfs.length < 10) throw new Error("fracsin can't intersect freqs");
	sops.forEach((sop, i) => {
		if (!sop.pressTgt) sop.init(mfs[i] * 0.75);
		sop.fTgt = mfs[i];
		sop.baseAmp = baseAmp(mfs[i], i);
		sop.baseFreq = mfs[i];
		sop.lfRate = 1 / (2 + ((i * 79.6789) % 3));
		sop.lfPhase = i;
	});
	sops.sort((a, b) => a.fTgt - b.fTgt);
	sops.forEach((sop, i) => { sop.i = i; });
};

// At control rate, modulate individual voices
graph.ctrl(t => {
	if (fParam1.changed() || fParam2.changed()) setFreqs();
	const env = 1 - 1 / (t * t * 0.15 + 1);
	for (const sop of sops) {
		sop.pressTgt = sop.baseAmp * env * (0.5 + 0.5 * Math.sin(t * sop.lfRate + sop.lfPhase));
		sop.fTgt = sop.baseFreq * (1 + 0.018 * Math.sin(t * sop.lfRate * 10));
		if (sop.i > smoothCut.value) {
			const amt = 1 - Math.min(1, sop.i - smoothCut.value);
			sop.pressTgt *= amt;
			sop.fTgt = 0.7 + amt*0.3;
		}
		sop.ctrl(t);
	}
});

export const process = graph.makeProcessor();
