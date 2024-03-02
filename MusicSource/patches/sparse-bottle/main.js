/**
 * Sparse bottle. This is a classic waveguide model for a closed-ended wind
 * instrument. This patch just plays the two notes that are given as parameters.
 * 
 * Audio-rate code is written in faust and can be found in the faust directory.
 * 
 * This file contains sequencing, envelopes, and other control code.
 */

import { Graph, FaustNode, Seq, Poly } from '../../lib/tealib.js';

export const sampleRate = 44100;
const graph = new Graph({ sampleRate });

// Post-processing Faust node
const post = new FaustNode('faust/post.dsp', { preamp: 1 });

// Parameters to control the patch
graph.addParam('preamp', { def: 1 }).connect(post.preamp);
// Frequencies to play
const fParam1 = graph.addParam('freq1', { def: '100*2' });
const fParam2 = graph.addParam('freq2', { def: '100*3' });
// Timbral parameters: breathiness and number of modes
const breath = graph.addParam('breath');
const modes = graph.addParam('modes', { def: 4, min: 0, max: 4 });

// The bottle instrument is polyphonic. This creates one polyphonic voice
const mkVoice = i => {
	const ret = new FaustNode('faust/bottle.dsp', { freq: 500, noise: 0, resmul: 1, modes: 4 });
	ret.notePos = 100;
	ret.amp = 1;
	ret.note = (freq, amp) => {
		ret.notePos = 0;
		ret.amp = amp * (1+breath.value*4) * (5/(modes.value+1));
		ret.freq.value = freq;
		ret.modes.value = modes.value;
		ret.resmul.value = 1/Math.pow(10, breath.value*2);
	};
	return ret;
};

// Use the Poly class to make an instrument with 3 managed voices
const poly = new Poly(3, mkVoice, post);

// At control rate, apply an envelope to all voices
const pulse = (k, x) => Math.max(0, (2 * Math.sqrt(k) * x) / (1 + k * x * x) - x * 0.01);
graph.ctrl(tSeconds => {
	poly.forEach(voice => {
		voice.notePos += 0.002;
		voice.noise.value = pulse(5, voice.notePos) * voice.amp;
	});
});

// Play the specified notes in a cycle
let cycle = 0;
post.connect(graph.out);
const seq = new Seq(graph);
seq.schedule(async () => {
	poly.note(fParam1.value, 0.4);
	await seq.play(3);
	poly.note(fParam2.value, 0.5);
	await seq.play(4);
	while (true) {
		poly.note(fParam1.value, 0.5);
		await seq.play(2);
		await seq.play((cycle * 0.382) % 1);
		if (cycle % 2) poly.note(fParam2.value, 0.7);
		await seq.play(4);
		await seq.play((cycle * 0.382 * 2 + 1) % 2);
		cycle++;
	}
});

export const process = graph.makeProcessor();
