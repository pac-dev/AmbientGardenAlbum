/**
 * Reed-like polyphonic patch playing a slow and simple progression. The reed
 * instrument is a simple waveguide model. A lot of delay is applied so it ends
 * up sounding mostly like a drone. Similar to the "ocean-theme" patch.
 * 
 * Audio-rate code is written in Faust and can be found in the faust directory.
 * 
 * This file contains sequencing, envelopes, and other control code.
 */

import { Graph, FaustNode, Seq, Poly } from '../../lib/tealib.js';
import { mixFreqs } from '../../lib/math.js';

export const sampleRate = 44100;
const graph = new Graph({ sampleRate });

// Create some nodes: Faust bass, and post-processing for the strings
const post = new FaustNode('faust/post.dsp', { preamp: 1, lpf: 16000 });
const bass = new FaustNode('faust/bass.dsp', { preamp: 1, freq: 0, noise1: 0, lp1: 3300, lp2: 580 });
post.connect(graph.out);
bass.connect(graph.out);

//Parameters to control the patch
const preamp = graph.addParam('preamp', { def: 1 });
preamp.connect(post.preamp);
preamp.connect(bass.preamp);
// Frequency centers for the generative progression
const fParam1 = graph.addParam('freq1', { def: '100*8' });
const fParam2 = graph.addParam('freq2', { def: '100*8*4/5' });
// Timbral parameters: lowpasses, bass amount
const lp1Param = graph.addParam('lp1', { def: 2000, min: 100, max: 15000 });
const bassiness = graph.addParam('bassiness');
// Parameter to pause the progression
const freeze = graph.addParam('freeze');

// The strings are polyphonic. This creates one polyphonic voice
const mkVoice = i => {
	const ret = new FaustNode('faust/reed.dsp', { freq: 500, noise: 0, lp1: 2000 });
	lp1Param.connect(ret.lp1);
	ret.notePos = 100;
	ret.amp = 1;
	ret.note = (freq, amp) => {
		ret.freq.value = freq/2;
		ret.notePos = 0;
		ret.amp = amp;
	};
	return ret;
};

// Use the Poly class to make an instrument with 3 managed voices
const poly = new Poly(3, mkVoice, post);

// At control rate, apply an envelope to all voices
const atk = 4, rel = 3;
const env = (x) => {
	if (x < atk) return 1-Math.cos(Math.PI*x/atk);
	if (x < atk+rel) return 1+Math.cos(Math.PI*(x-atk)/rel);
	return 0;
};
let bassTgt = 0;
graph.ctrl((tSec, delta) => {
	post.lpf.value = 16000*(1-.8/(tSec*tSec*0.002+1));
	bass.noise1.value += (bassTgt - bass.noise1.value)*0.001;
	poly.forEach(voice => {
		voice.notePos += delta;
		voice.noise.value = env(voice.notePos) * voice.amp;
	});
});

const seq = new Seq(graph);

// Generate a set of pitches for the progression
const scaleLen = 6;
let freqs;
const setFreqs = () => {
	freqs = mixFreqs(fParam1.value, fParam2.value, 0.5);
	freqs = freqs.filter(f => f>567 && f<1380).slice(0,scaleLen).sort((a, b) => a - b);
};
const noteGen = function * () {
	let i = 0;
	while (true) {
		yield i % scaleLen;
		yield (i+4) % scaleLen;
		i++;
	}
};

// Run the progression according to the parameters and generated pitches
seq.schedule(async () => {
	const gen = noteGen();
	while (true) {
		if (fParam1.changed() || fParam2.changed()) setFreqs();
		const i = gen.next().value;
		poly.note(freqs[i], 0.7);
		if (i < scaleLen/2) {
			bass.freq.value = freqs[i];
			bass.noise1.value = 0;
			bassTgt = bassiness.value*2;
			while (bass.freq.value > 110) bass.freq.value /= 2;
		}
		while (i === 0 && freeze.value) await seq.play(1);
		await seq.play(5);
	}
});

export const process = graph.makeProcessor();
