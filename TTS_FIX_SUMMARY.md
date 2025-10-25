# TTS (Text-to-Speech) Audio Generation Fix

## Problem
The pipeline was failing with error: **"TTS generation failed: No audio data received from TTS service"**

### Root Cause
The `audioGenerator.ts` was using an unreliable direct approach to Google Translate's TTS endpoint:
- Direct endpoint calls to `https://translate.google.com/translate_tts` were failing
- No proper error handling or retry logic
- Missing audio data validation
- No use of the already-installed `google-tts-api` package

## Solution

### Changes Made to `src/lib/agents/audioGenerator.ts`

1. **Integrated `google-tts-api` Package**
   - Switched from direct fetch calls to using the `google-tts-api` library
   - This package properly handles the Google Translate TTS API endpoints
   - Already installed in `package.json` but wasn't being utilized

2. **Added Robust Error Handling**
   - Implemented 3-retry logic for failed requests
   - Exponential backoff between retries (1s, 2s delays)
   - Better error messages for debugging

3. **Audio Validation**
   - Added `isValidAudioBuffer()` function to verify MP3 headers
   - Validates that received data has minimum size requirements
   - Checks for valid MP3 frame headers (0xFF 0xFB or 0xFF 0xFA)

4. **Improved Text Chunking**
   - Split text into sentence-based chunks (max 100 chars per chunk)
   - Prevents exceeding API limits for individual requests
   - Better handles long-form news scripts

5. **Proper HTTP Headers**
   - Added appropriate User-Agent header to avoid blocking
   - Added Accept and Referer headers
   - Used AbortController for proper timeout handling

6. **Type Consistency**
   - Changed return type from `ArrayBuffer` to `Buffer` for consistency
   - Properly handles Buffer concatenation for multi-chunk audio

### Key Improvements

| Aspect | Before | After |
|--------|--------|-------|
| API Reliability | Direct endpoint (unreliable) | `google-tts-api` package |
| Retry Logic | None | 3 retries with backoff |
| Audio Validation | Basic size check | MP3 header validation |
| Text Handling | Simple length check | Sentence-based chunking |
| Error Messages | Generic errors | Detailed, actionable errors |
| Return Type | ArrayBuffer | Buffer |

## Testing the Fix

1. **Unit Test for Audio Generation**
```typescript
// Test with sample text
const text = "Breaking news: Technology advances continue at rapid pace.";
const audioBuffer = await generateAudio(text, "en");
// Should return valid Buffer with MP3 data
```

2. **Integration Test via Pipeline**
```bash
POST /api/run-pipeline
{
  "userId": "user123",
  "email": "user@example.com",
  "language": "en",
  "newsType": "tech"
}
```

## Environment Requirements

Ensure you have:
- `google-tts-api` package (already in `package.json`)
- Valid network connectivity
- Proper User-Agent header support

## Fallback/Alternative Options

If issues persist, consider:

1. **Using Google Cloud Text-to-Speech API**
   - Professional, reliable service
   - Requires API key and billing
   - Higher quality audio

2. **Using AWS Polly**
   - Enterprise-grade TTS
   - Better voice options
   - Requires AWS credentials

3. **Using Web Speech API** (Client-side only)
   - Free but limited language support
   - Browser-dependent

## Monitoring

Monitor these logs for TTS issues:
- `"Step 5: Generating audio file"` - Indicates TTS generation started
- `"Audio file generated and uploaded"` - Indicates success
- Error messages starting with `"TTS generation failed:"` - Indicates failure

## Performance Notes

- Single chunk (~100 chars): ~2-3 seconds
- Multi-chunk text: ~1-2 seconds per chunk + network latency
- Retry delays: 1s + 2s = max 3 seconds overhead on failure
- Total typical pipeline time: ~30-60 seconds

## Related Files Modified

- `src/lib/agents/audioGenerator.ts` - Main fix
- Build verified: ✅ `npm run build` passes without errors
