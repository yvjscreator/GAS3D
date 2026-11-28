import importlib
import io
import json
import threading
import time
import unittest
import wave
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

engine = importlib.import_module('subtitle_engine.app')
PERSONAL_KEY = 'fixture_personal_key_123456'


class ProviderError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


class ScriptJobTests(unittest.TestCase):
    def test_collection_job_reports_stage_and_is_private_to_the_session(self):
        entered = threading.Event()
        release = threading.Event()
        calls = []
        result = {
            'title': 'Colección', 'detectedProduct': 'Poleras', 'summary': 'Dos diseños',
            'script': 'La velocidad tiene su símbolo. Aquí empieza la magia.', 'estimatedSeconds': 4,
            'segments': [
                {'start': 0, 'end': 3, 'purpose': 'hook', 'label': 'Snitch Dorada',
                 'visibleText': 'Catch me', 'text': 'La velocidad tiene su símbolo.'},
                {'start': 3, 'end': 6, 'purpose': 'product', 'label': 'Castillo',
                 'text': 'Aquí empieza la magia.'},
            ],
        }

        def interact(**kwargs):
            calls.append(kwargs)
            if len(calls) == 1:
                entered.set()
                if not release.wait(3):
                    raise RuntimeError('Test timed out')
                raise ProviderError(503, 'service unavailable')
            if len(calls) == 2:
                raise ProviderError(404, 'model not found')
            if len(calls) == 3:
                return SimpleNamespace(output_text='{}')
            return SimpleNamespace(output_text=json.dumps(result))

        media = SimpleNamespace(uri='fake', mime_type='video/mp4', name='test', state=None)
        fake_client = SimpleNamespace(files=SimpleNamespace(upload=lambda **_: media, delete=lambda **_: None),
                                      interactions=SimpleNamespace(create=interact))
        client = TestClient(engine.app)
        with patch.object(engine, 'GEMINI_API_KEY', 'test'), patch.object(engine, 'SCRIPT_MODELS', ['first', 'second', 'third', 'fourth']), \
             patch.object(engine, '_new_genai_client', return_value=fake_client) as make_client, \
             patch.object(engine, '_probe', return_value={'duration': 6.0}):
            response = client.post('/api/subtitles/presentation/script-jobs',
                                   headers={'X-AI-Session-ID': 'collection-test', engine.GEMINI_KEY_HEADER: PERSONAL_KEY},
                                   files={'video': ('test.mp4', b'media', 'video/mp4')},
                                   data={'presentation_type': 'collection', 'collection_items': 'Snitch Dorada\nCastillo'})
            self.assertEqual(response.status_code, 202)
            self.assertTrue(entered.wait(2))
            path = f"/api/subtitles/presentation/script-jobs/{response.json()['id']}"
            try:
                self.assertEqual(client.get('/api/subtitles/health').status_code, 200)
                self.assertEqual(client.get(path, headers={'X-AI-Session-ID': 'other'}).status_code, 404)
                self.assertEqual(client.get(path, headers={'X-AI-Session-ID': 'collection-test'}).json()['status'], 'writing')
            finally:
                release.set()
            for _ in range(20):
                state = client.get(path, headers={'X-AI-Session-ID': 'collection-test'}).json()
                if state['status'] == 'ready':
                    break
                time.sleep(.025)
            self.assertEqual(state['status'], 'ready', state)
            self.assertEqual([call['model'] for call in calls], ['first', 'second', 'third', 'fourth'])
            make_client.assert_called_once_with(PERSONAL_KEY)
            self.assertNotIn(PERSONAL_KEY, str(engine._script_jobs))
            self.assertEqual(state['result']['segments'][0]['visibleText'], 'Catch me')
            self.assertIn('Snitch Dorada', calls[0]['input'][1]['text'])
            self.assertEqual(calls[0]['input'][0]['processing']['fps'], 2.0)

    def test_expired_job_cannot_overwrite_its_error_with_a_late_result(self):
        job = dict(id='test-expired', owner=('local', 'expiry'), deadline=time.monotonic() - 1,
                   finished_at=None, status='writing', message='Escribiendo…', error=None, result=None)
        with patch.dict(engine._script_jobs, {'test-expired': job}):
            state = engine._script_status(job['id'], job['owner'])
            self.assertEqual(state['status'], 'error')
            engine._write_script_status(job, status='ready', result={'script': 'late'})
            self.assertIsNone(engine._script_status(job['id'], job['owner'])['result'])


class GeminiKeyTests(unittest.TestCase):
    def test_tts_reaches_third_model_when_quota_and_empty_audio_fail(self):
        calls = []
        full_script = 'Primer bloque. Segundo bloque.'

        def interact(model, **kwargs):
            calls.append(model)
            self.assertEqual(kwargs['input'][0]['content'][0]['text'], full_script)
            if len(calls) == 1:
                raise ProviderError(429, 'Rate limit: ' + PERSONAL_KEY)
            return SimpleNamespace(output_audio=None)

        def legacy(model, contents, config):
            calls.append(model)
            self.assertTrue(contents.endswith(full_script))
            self.assertEqual(config.speech_config.voice_config.prebuilt_voice_config.voice_name, 'Sulafat')
            part = SimpleNamespace(inline_data=SimpleNamespace(data=b'\x01\x00' * 128, mime_type='audio/L16;rate=24000'))
            return SimpleNamespace(candidates=[SimpleNamespace(content=SimpleNamespace(parts=[part]))])

        fake = SimpleNamespace(interactions=SimpleNamespace(create=interact), models=SimpleNamespace(generate_content=legacy))
        with patch.object(engine, 'GEMINI_API_KEY', None), patch.object(engine, 'TTS_MODELS', [*engine.DEFAULT_TTS_MODELS, engine.LEGACY_TTS_MODEL]), \
             patch.object(engine, '_new_genai_client', return_value=fake) as make_client:
            client = TestClient(engine.app)
            response = client.post('/api/subtitles/presentation/tts', json={'script': full_script},
                                   headers={engine.GEMINI_KEY_HEADER: PERSONAL_KEY, 'X-AI-Session-ID': 'tts-fallback-test'})
            self.assertEqual(response.status_code, 200, response.text if response.status_code != 200 else '')
            self.assertEqual(calls, [*engine.DEFAULT_TTS_MODELS, engine.LEGACY_TTS_MODEL])
            self.assertEqual(response.headers['X-AI-Model'], engine.LEGACY_TTS_MODEL)
            make_client.assert_called_once_with(PERSONAL_KEY)
            with wave.open(io.BytesIO(response.content), 'rb') as wav:
                self.assertEqual(wav.getframerate(), 24000)
                self.assertEqual(wav.getnframes(), 128)
            self.assertNotIn(PERSONAL_KEY, client.get('/api/subtitles/ai/logs/tts-fallback-test').text)

    def test_invalid_personal_key_stops_without_using_server_key_or_echoing_secret(self):
        fake = SimpleNamespace(interactions=SimpleNamespace(create=lambda **_: None))
        with patch.object(engine, 'GEMINI_API_KEY', 'server-key'), patch.object(engine, '_new_genai_client', return_value=fake) as make_client, \
             patch.object(fake.interactions, 'create', side_effect=ProviderError(400, f'API_KEY_INVALID: {PERSONAL_KEY}')) as call:
            client = TestClient(engine.app)
            response = client.post('/api/subtitles/presentation/tts', json={'script': 'Hola.'},
                                   headers={engine.GEMINI_KEY_HEADER: PERSONAL_KEY, 'X-AI-Session-ID': 'tts-invalid-test'})
            self.assertIn('rechazó la clave', response.json()['detail'])
            self.assertNotIn(PERSONAL_KEY, response.text)
            call.assert_called_once()
            make_client.assert_called_once_with(PERSONAL_KEY)
            self.assertNotIn(PERSONAL_KEY, client.get('/api/subtitles/ai/logs/tts-invalid-test').text)

    def test_transcription_job_passes_key_only_to_the_worker(self):
        with patch.object(engine, 'GEMINI_API_KEY', 'server-key'), patch.object(engine, '_executor') as executor, \
             patch.object(engine, '_probe', return_value={'duration': 1.0}):
            response = TestClient(engine.app).post('/api/subtitles/jobs', files={'video': ('voice.wav', b'audio', 'audio/wav')},
                                                 headers={engine.GEMINI_KEY_HEADER: PERSONAL_KEY})
            self.assertEqual(response.status_code, 200)
            job_id = response.json()['id']
            executor.submit.assert_called_once_with(engine._transcribe, job_id, PERSONAL_KEY)
            self.assertNotIn(PERSONAL_KEY, response.text)
            self.assertNotIn(PERSONAL_KEY, str(engine._jobs[job_id]))


if __name__ == '__main__':
    unittest.main()
