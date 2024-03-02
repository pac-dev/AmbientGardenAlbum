// Rainstick instrument in Faust

import("stdfaust.lib");

// Use "sliders" to add parameters to control the instrument
preamp = hslider("preamp", 1, 0, 1, 0.0001);
density = hslider("density", 0, 0, 1, 0.0001);
noiseamp = hslider("noiseamp", 0, 0, 1, 0.0001);
bodyf = hslider("bodyf", 800, 200, 2000, 0.001);

// Rainstick resonant body
durmul = 0.003;
body = _*0.5 : fi.highpass(3, 900) <:
	fi.highpass(3, 5000)*2,
	pm.modeFilter(bodyf*1.0, 4.58*durmul, 0.07),
	pm.modeFilter(bodyf*1.53, 4.59*durmul, 0.05),
	pm.modeFilter(bodyf*1.97, 4.6*durmul, 0.06),
	pm.modeFilter(bodyf*2.98, 4.7*durmul, 0.05),
	pm.modeFilter(bodyf*5.41, 0.65*durmul, 0.02),
	pm.modeFilter(bodyf*9, 0.65*durmul, 0.04)
:> _;

// Noise grains using "sparse_noise" as a trigger
noise2 = no.sparse_noise(density) : an.amp_follower(0.2) : _*no.pink_noise*noiseamp*preamp
: fi.highpass(2, 3700);
n3atk = 0.01;
noise3 = no.sparse_noise(density*10) : ba.peakholder(n3atk : ba.sec2samp) 
: en.are(n3atk, 1.5) : _*no.pink_noise*noiseamp*preamp
: fi.highpass(2, 3200);

// Post-processing: reverb, delay, compression
rev_st = re.zita_rev1_stereo(0, 200, 6000, 0.4, 0.7, 44100);
del_st = + ~ @(0.05 : ba.sec2samp) * 0.6, + ~ @(0.07 : ba.sec2samp) * 0.6;
del_st2 = + ~ @(1.3 : ba.sec2samp) * 0.9, + ~ @(1.5 : ba.sec2samp) * 0.9;

post = _ : body+noise2*0.2+noise3*0.1 <: _,_,del_st :> _,_,del_st2 :> rev_st : @(1.5 : ba.sec2samp),_ : co.limiter_1176_R4_stereo;
process = _*preamp*(0.07 + no.pink_noise*1.5)+noise2*0.6+noise3*0.6 : post;
