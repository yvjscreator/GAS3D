import importlib
import json
import threading
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

engine = importlib.import_module('subtitle_engine.app')


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
                raise RuntimeError('503: service unavailable')
            return SimpleNamespace(output_text=json.dumps(result))

        media = SimpleNamespace(uri='fake', mime_type='video/mp4', name='test', state=None)
        fake_client = SimpleNamespace(files=SimpleNamespace(upload=lambda **_: media, delete=lambda **_: None),
                                      interactions=SimpleNamespace(create=interact))
        client = TestClient(engine.app)
        with patch.object(engine, 'GEMINI_API_KEY', 'test'), patch.object(engine, 'SCRIPT_MODELS', ['first', 'second']), \
             patch.object(engine, '_new_genai_client', return_value=fake_client), \
             patch.object(engine, '_probe', return_value={'duration': 6.0}):
            response = client.post('/api/subtitles/presentation/script-jobs',
                                   headers={'X-AI-Session-ID': 'collection-test'},
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
            self.assertEqual([call['model'] for call in calls], ['first', 'second'])
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


if __name__ == '__main__':
    unittest.main()
