# ChatUI local RC third-party notices

This is a local Release Candidate, not a published release. Original ChatUI contributions are licensed under MIT; Copyright (c) 2026 Jess(T o X). See [LICENSE](LICENSE). Third-party code and assets retain their original licenses and copyright notices; the root MIT license does not relicense them.

## Shipped code and generated artifacts

| Material | Exact version or source identity | License | Distribution role |
|---|---|---|---|
| DOMPurify | 3.4.16 | MPL-2.0 OR Apache-2.0; Apache-2.0 notice retained below | Embedded in response generated JS/HTML only. The offline Document Gallery does not embed DOMPurify. |
| regenerator-runtime helper | bundled in DOMPurify 3.4.16; no separate npm version asserted | MIT, Copyright (c) 2014-present Facebook, Inc. | Embedded in response generated JS/HTML only; absent from Document Gallery. |
| shadcn stylesheet | vendored `shadcn-tailwind-4.13.0.css` | MIT | Stylesheet shipped in Source ZIP; copyright notice retained below. |
| OpenAI Sites Vite plugin | vendored source declares 0.2.0 (`openai/sites#9`); exact source hash in inventory | MIT | Source/build integration only; original notice retained below. Upstream origin not independently revalidated in Phase 3. |
| KaTeX | 0.19.0 | MIT | Trusted server/build compiler produces fixed MathML. Library JavaScript/fonts are not in Gallery. |
| marked | 18.1.0 | MIT, with original Markdown BSD notice | Trusted server/build Markdown compiler. Not shipped as Gallery runtime code. |
| sanitize-html | 2.18.0 | MIT | Trusted server/build HTML sanitizer. Not shipped as Gallery runtime code. |
| esbuild | 0.28.2 | MIT | Build bundler. Not shipped as Gallery runtime code. |

The Gallery is exactly seven static files, includes the separate notice copy below, and loads no npm library, remote script, CDN or remote font. Generated markup and authored ChatUI runtime are distinct from the installed server/build dependencies.

## Locked install dependencies

The Source ZIP ships manifests/lockfiles and the code that imports dependencies; it excludes `node_modules`. The table identifies all direct dependencies at their resolved lockfile versions. Dev dependencies run installation/build/tests; the other Renderer dependencies are installed for server/app use and are not thereby embedded into the Gallery. Transitive dependencies, optional platform packages, integrity strings and per-lock hashes are recorded in the [full dependency inventory](docs/final-edition/third-party-dependencies.json). The inventory uses each package's declared license metadata, with no missing license entries. Installed dependencies retain their own npm license files when fetched by locked install; this source distribution does not redistribute their complete packages.

| Scope | Dependency | Locked version | Declared license | Role |
|---|---|---|---|---|
| root-test | `jsdom` | 30.1.1 | MIT | install/build/test |
| renderer | `@base-ui/react` | 1.7.0 | MIT | server/app install dependency |
| renderer | `@hookform/resolvers` | 5.7.1 | MIT | server/app install dependency |
| renderer | `@shadcn/react` | 0.3.0 | MIT | server/app install dependency |
| renderer | `class-variance-authority` | 0.7.1 | Apache-2.0 | server/app install dependency |
| renderer | `clsx` | 2.1.1 | MIT | server/app install dependency |
| renderer | `cmdk` | 1.1.1 | MIT | server/app install dependency |
| renderer | `date-fns` | 4.4.0 | MIT | server/app install dependency |
| renderer | `dompurify` | 3.4.16 | (MPL-2.0 OR Apache-2.0) | server/app install dependency |
| renderer | `drizzle-orm` | 0.45.2 | Apache-2.0 | server/app install dependency |
| renderer | `embla-carousel-react` | 8.6.0 | MIT | server/app install dependency |
| renderer | `htmlparser2` | 12.0.0 | MIT | server/app install dependency |
| renderer | `input-otp` | 1.4.2 | MIT | server/app install dependency |
| renderer | `katex` | 0.19.0 | MIT | server/app install dependency |
| renderer | `lucide-react` | 1.31.0 | ISC | server/app install dependency |
| renderer | `marked` | 18.1.0 | MIT | server/app install dependency |
| renderer | `next` | 16.3.4 | MIT | server/app install dependency |
| renderer | `next-themes` | 0.4.6 | MIT | server/app install dependency |
| renderer | `radix-ui` | 1.6.7 | MIT | server/app install dependency |
| renderer | `react` | 19.2.6 | MIT | server/app install dependency |
| renderer | `react-day-picker` | 10.0.1 | MIT | server/app install dependency |
| renderer | `react-dom` | 19.2.6 | MIT | server/app install dependency |
| renderer | `react-hook-form` | 7.85.0 | MIT | server/app install dependency |
| renderer | `react-resizable-panels` | 4.12.2 | MIT | server/app install dependency |
| renderer | `recharts` | 3.8.0 | MIT | server/app install dependency |
| renderer | `sanitize-html` | 2.18.0 | MIT | server/app install dependency |
| renderer | `saxes` | 6.0.0 | ISC | server/app install dependency |
| renderer | `sonner` | 2.0.8 | MIT | server/app install dependency |
| renderer | `tailwind-merge` | 3.6.0 | MIT | server/app install dependency |
| renderer | `vaul` | 1.1.2 | MIT | server/app install dependency |
| renderer | `zod` | 3.25.76 | MIT | server/app install dependency |
| renderer | `@cloudflare/vite-plugin` | 1.37.1 | MIT | install/build/test |
| renderer | `@cloudflare/workers-types` | 4.20260515.1 | MIT OR Apache-2.0 | install/build/test |
| renderer | `@tailwindcss/postcss` | 4.2.1 | MIT | install/build/test |
| renderer | `@types/node` | 22.19.19 | MIT | install/build/test |
| renderer | `@types/react` | 19.2.14 | MIT | install/build/test |
| renderer | `@types/react-dom` | 19.2.3 | MIT | install/build/test |
| renderer | `@vitejs/plugin-react` | 6.0.2 | MIT | install/build/test |
| renderer | `@vitejs/plugin-rsc` | 0.5.26 | MIT | install/build/test |
| renderer | `ajv` | 8.20.0 | MIT | install/build/test |
| renderer | `drizzle-kit` | 0.31.10 | MIT | install/build/test |
| renderer | `esbuild` | 0.28.2 | MIT | install/build/test |
| renderer | `eslint` | 9.39.4 | MIT | install/build/test |
| renderer | `eslint-config-next` | 16.3.4 | MIT | install/build/test |
| renderer | `jsdom` | 30.1.1 | MIT | install/build/test |
| renderer | `json-rpc-2.0` | 1.7.1 | MIT | install/build/test |
| renderer | `raw-body` | 3.0.2 | MIT | install/build/test |
| renderer | `react-server-dom-webpack` | 19.2.6 | MIT | install/build/test |
| renderer | `tailwindcss` | 4.2.1 | MIT | install/build/test |
| renderer | `tw-animate-css` | 1.4.0 | MIT | install/build/test |
| renderer | `typescript` | 5.9.3 | Apache-2.0 | install/build/test |
| renderer | `vinext` | 1.0.0-beta.5 | MIT | install/build/test |
| renderer | `vite` | 8.0.13 | MIT | install/build/test |
| renderer | `wrangler` | 4.92.0 | MIT OR Apache-2.0 | install/build/test |

## Optional Python install dependencies

`requirements-phase3.txt` pins the already available environment used to exercise the optional static force PNG/SVG adapter. The Gallery, JavaScript renderer and Python stdlib generation do not need these packages. They are external install dependencies, not code redistributed in this Source ZIP; each installation retains its own license and any wheel-bundled native-library notices. Versions and licenses below were checked against the existing installed distribution metadata; the inventory is regenerated from the public requirements file and the recorded license identity, without reading personal configuration.

| Dependency | Pinned version | Distribution license |
|---|---|---|
| `matplotlib` | 3.9.4 | Matplotlib license (PSF based) |
| `numpy` | 2.0.2 | BSD-3-Clause and bundled-library notices |
| `Pillow` | 11.3.0 | MIT-CMU |
| `contourpy` | 1.3.0 | BSD-3-Clause |
| `cycler` | 0.12.1 | BSD-3-Clause |
| `fonttools` | 4.60.2 | MIT |
| `kiwisolver` | 1.4.7 | BSD-3-Clause |
| `packaging` | 26.3 | Apache-2.0 OR BSD-2-Clause |
| `pyparsing` | 3.3.2 | MIT |
| `python-dateutil` | 2.9.0.post0 | Apache-2.0 OR BSD-3-Clause |
| `six` | 1.16.0 | MIT |

## Compiler and generated-resource notices

# Third-party notices

The offline Document Gallery uses generated MathML, the existing ChatUI compositor and canonical component runtime. It does not bundle or load these npm libraries at runtime. No remote resources or fonts are required. This local RC includes fixed compiler output and retained notices for its trusted build pipeline.

| Dependency | Locked version | License | Role in delivered artifacts |
|---|---|---|---|
| KaTeX | 0.19.0 | MIT | Server/build math compiler; fixed MathML output only in Gallery. |
| marked | 18.1.0 | MIT and retained Markdown BSD notice | Server/build Markdown compiler; no library runtime in Gallery. |
| sanitize-html | 2.18.0 | MIT | Server/build sanitizer; no library runtime in Gallery. |
| esbuild | 0.28.2 | MIT | Build bundler; no library runtime in Gallery. |
| DOMPurify | 3.4.16 | MPL-2.0 OR Apache-2.0; Apache notice selected below | Embedded only in sibling response resources in the Source ZIP; absent from this Document Gallery. |

Original ChatUI contributions are licensed under MIT; Copyright (c) 2026 Jess(T o X). The distribution includes the full project LICENSE. Third-party code and assets retain their original licenses and copyright notices; the root MIT license does not relicense them.

## KaTeX

The MIT License (MIT)

Copyright (c) 2013-2020 Khan Academy and other contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## DOMPurify (build/response resource only)


                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.


## marked (build compiler only)

# License information

## Contribution License Agreement

If you contribute code to this project, you are implicitly allowing your code
to be distributed under the MIT license. You are also implicitly verifying that
all code is your original work. `</legalese>`

## Marked

Copyright (c) 2018+, MarkedJS (https://github.com/markedjs/)
Copyright (c) 2011-2018, Christopher Jeffrey (https://github.com/chjj/)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## Markdown

Copyright © 2004, John Gruber
http://daringfireball.net/
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
* Neither the name “Markdown” nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

This software is provided by the copyright holders and contributors “as is” and any express or implied warranties, including, but not limited to, the implied warranties of merchantability and fitness for a particular purpose are disclaimed. In no event shall the copyright owner or contributors be liable for any direct, indirect, incidental, special, exemplary, or consequential damages (including, but not limited to, procurement of substitute goods or services; loss of use, data, or profits; or business interruption) however caused and on any theory of liability, whether in contract, strict liability, or tort (including negligence or otherwise) arising in any way out of the use of this software, even if advised of the possibility of such damage.


## sanitize-html (build compiler only)

Copyright (c) 2013, 2014, 2015 P'unk Avenue LLC

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


## esbuild (build bundler only)

MIT License

Copyright (c) 2020 Evan Wallace

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.




## Vendored shadcn stylesheet

MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## Copied OpenAI Sites build integration

MIT License

Copyright (c) 2026 OpenAI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## Bundled regenerator-runtime helper

MIT License

Copyright (c) 2014-present, Facebook, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
