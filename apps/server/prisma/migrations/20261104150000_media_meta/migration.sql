-- Fast images (sender-made thumbnail + tiny blurred placeholder) and voice messages (duration + waveform)
ALTER TABLE "Attachment" ADD COLUMN     "thumbKey" TEXT,
ADD COLUMN     "placeholder" TEXT,
ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "waveform" TEXT;
