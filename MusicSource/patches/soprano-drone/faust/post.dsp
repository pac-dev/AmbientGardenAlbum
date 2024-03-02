// Post-processing in Faust: limiter, flanger, phaser, reverb, delay

import("stdfaust.lib");
preamp = hslider("preamp", 1, 0, 1, 0.0001);

timbre = fi.highpass(1, 3000) : fi.high_shelf(8, 2500) : fi.notchw(150, 720);
limiter = *(10) : co.limiter_1176_R4_mono;
fl = _ <: _*0.9, de.fdelay2(200, 45+30*os.osc(0.7))*0.2 :> _;
post1 = timbre : limiter : fl;

phaser = pf.phaser2_mono(4, 0, 1000, 400, 1.5, 1500, 0.7, 1.5, 0.6, 1);
rev_st = re.zita_rev1_stereo(0, 200, 6000, 10, 7, 44100);
del = + ~ @(1.13 : ba.sec2samp) * 0.8;

process = post1*preamp : phaser : del <: rev_st;
