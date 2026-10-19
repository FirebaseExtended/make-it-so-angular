/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  ApplicationConfig,
  InjectionToken,
  inject,
  provideEnvironmentInitializer,
  provideZoneChangeDetection,
} from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  AppCheck,
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
} from 'firebase/app-check';
import { Auth, getAuth } from 'firebase/auth';
import { AI, GoogleAIBackend, getAI } from 'firebase/ai';
import {
  Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { environment } from '../environments/environments';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

declare global {
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string;
}

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP');
export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');
export const FIREBASE_AI = new InjectionToken<AI>('FIREBASE_AI');
export const FIREBASE_APP_CHECK = new InjectionToken<AppCheck>('FIREBASE_APP_CHECK');

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    {
      provide: FIREBASE_APP,
      useFactory: () => initializeApp(environment.firebase),
    },
    ...(environment.firebase.recaptchaSiteKey
      ? [
          // Turn on app check for Vertex AI in Firebase
          {
            provide: FIREBASE_APP_CHECK,
            useFactory: () => {
              // TODO: don't use debug token in prod
              // self.FIREBASE_APPCHECK_DEBUG_TOKEN = environment.debug_token;

              return initializeAppCheck(inject(FIREBASE_APP), {
                provider: new ReCaptchaEnterpriseProvider(
                  environment.firebase.recaptchaSiteKey || ''
                ),
                isTokenAutoRefreshEnabled: true,
              });
            },
          },
          provideEnvironmentInitializer(() => {
            inject(FIREBASE_APP_CHECK);
          }),
        ]
      : []),
    {
      provide: FIREBASE_AI,
      useFactory: () =>
        getAI(inject(FIREBASE_APP), { backend: new GoogleAIBackend() }),
    },
    {
      provide: FIREBASE_AUTH,
      useFactory: () => getAuth(inject(FIREBASE_APP)),
    },
    {
      provide: Firestore,
      useFactory: () =>
        initializeFirestore(inject(FIREBASE_APP), {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        }),
    },
    provideAnimationsAsync(),
  ],
};
