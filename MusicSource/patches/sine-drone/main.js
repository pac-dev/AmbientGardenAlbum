/**
 * Sine drone.
 * 
 * A simple additive synthesizer. At its core is a bank of sine waves, tuned to
 * be multiples of both input frequencies.
 * 
 * Post-processing code is written in Faust and can be found in faust/post.dsp
 */

import { Graph, FaustNode, Sine } from '../../lib/tealib.js';
import { mixFreqs } from '../../lib/math.js';

export const sampleRate = 44100;
const graph = new Graph({ sampleRate });

// Post-processing Faust node
const post = new FaustNode('faust/post.dsp', { preamp: 1 });

// Parameters to control the patch
graph.addParam('preamp', { def: 1 }).connect(post.preamp);
// Frequency centers for the generative chord
const fParam1 = graph.addParam('freq1', { def: '100*4' });
const fParam2 = graph.addParam('freq2', { def: '100*6' });

post.connect(graph.out);
const baseAmp = (freq, i) => 1 / (i + 1);
const sines = [...new Array(10)].map(i => new Sine());
sines.forEach(s => s.connect(post));

// Generate a set of pitches for the chord
let setFreqs = () => {
	const mfs = mixFreqs(fParam1.value, fParam2.value, 3);
	if (mfs.length < 10) throw new Error("fracsin can't intersect freqs");
	sines.forEach((sine, i) => {
		sine.baseAmp = baseAmp(mfs[i], i) * 0.3;
		sine.baseFreq = mfs[i];
		sine.lfRate = 1 / (2 + ((i * 79.6789) % 3));
		sine.lfPhase = i;
	});
};

// At control rate, modulate components of the chord
graph.ctrl(tSec => {
	if (fParam1.changed() || fParam2.changed()) setFreqs();
	const env = 1 - 1 / (tSec * tSec * 0.15 + 1);
	for (let sine of sines) {
		sine.amp.value = sine.baseAmp * env * (0.5 + 0.5 * Math.sin(tSec * sine.lfRate + sine.lfPhase));
		sine.freq.value = sine.baseFreq * (1 + 0.018 * Math.sin(tSec * sine.lfRate * 10));
	}
});

export const process = graph.makeProcessor();
