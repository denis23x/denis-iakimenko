---
title: Adding new posts in AstroPaper theme
description: Some rules & recommendations for creating or adding new posts using AstroPaper theme.
pubDatetime: 2022-09-23T15:22:00Z
modDatetime: 2025-06-13T16:52:45.934Z
author: Denis Iakimenko
slug: z
featured: false
draft: false
tags:
  - astro
  - supabase
---

## Table of contents

## Вступление

После установки **Astro 6** и первичной настройки, мне стало интересно как добавить счетчик просмотр на свои страницы? Естественно я пошел искать и нашел следующие реализации

[https://crockettford.dev/blog/astro-blog-views-counter](https://crockettford.dev/blog/astro-blog-views-counter)

О боже мой, почему все так сложно? Половину этого кода следует выкинуть, это абсолютно не нужно

[https://mvlanga.com/blog/how-to-build-a-page-view-counter-with-astro-db-actions-and-server-side-islands/](https://mvlanga.com/blog/how-to-build-a-page-view-counter-with-astro-db-actions-and-server-side-islands/)

Это другая реализация, но она такая же громоздкая и сложная для обывателей

[https://elazizi.com/posts/add-views-counter-to-your-astro-blog-posts/](https://elazizi.com/posts/add-views-counter-to-your-astro-blog-posts/)

Вот это уже лучше! Это намного проще чем предыдущие реализации, НО, это очень хрупкое решение, реализация зависит от стороннего сервиса и если по нему перейти прямо сейчас вы увидите что сайт больше не доступен, теперь понимаете почему это хрупкая реализация?

---

Достаточно примеров, сейчас я напишу свою реализацию, это будет крутое и очень простое решение, а так же я гарантирую что это будет работать годами!

## План

Мы будем использовать **Supabase** как **Postgres** базу данных, будем использовать **Edge Functions** как бекенд и там же опишем всю логику просмотра и обновления. В конце работы создадим **Astro** компонент для отображения просмотров

## Реализация

Если у вас еще нет аккаунта в **Supabase** я бы посоветовал его создать, подтвердить почту и создать свой первый проект, в настройках все оставляйте по умолчанию, нам сейчас это абсолютно не нужно

### БД

После того как вы создадите свой первый проект нужно подождать несколько минут пока сервис его запустит, далее переходим в раздел **database → tables** и создаем новую таблицу, в поле имя пишем - views

#### Настройка полей

В разделах объявлений полей оставляем без изменений `id` и `created_at`.

Ниже нажимаем **Add column** и создаем новое поле `slug`, в названии указываем `slug`, в типе данных поля указываем `text` и в дополнительных настройках (иконка шестеренки) снимаем галочку с параметра `Is Nullable` это нужно для того что бы поле `slug` было обязательным для заполнения и ставим галочку в поле `Is Unique` для того что бы каждый `slug` был уникальным

Нажимаем еще раз **Add column** и создаем новое поле `views`, в названии указываем `views`, в типе данных указываем `int8` и в дополнительных настройках (иконка шестеренки) снимаем галочку с параметра `Is Nullable` это нужно для того что бы поле `views` было обязательным для заполнения, а так же указываем значение по умолчанию `0`

Для справки по лимитам этих типов данных

`text` — формально очень большой, практически ограничивается памятью и разумностью использования

`int8` — 8 байт, очень большой integer. Диапазон от -9,223,372,036,854,775,808 до 9,223,372,036,854,775,807 я желаю вам столько просмотров на ваших страницах!

Как вы можете понять, не стоит переживать о лимитах, все будет работать надежно, навсегда. На этом настройках таблицы закончена, нажимаем **Save** — готово!

#### Настройка уровней доступа

После того как БД была создана, она еще не доступна для взаимодействия, нужно настроить уровни доступа к ней. Переходим в раздел **authentication → policies** где можно увидеть список таблиц, в строке с нашей таблицей views нажимаем Create Policy

В открывшемся окне, в поле **Policy Name** пишем `Public Read`, в поле **Policy Command** выбираем `SELECT` и ниже в редакторе кода сразу после строки `using` пишем `true`. Все остальные настройки без изменений

Вот теперь эта таблица доступна для чтения абсолютно всем! Мы не имеем никаких чувствительных данных в этой таблице, так что это абсолютно нормально, не переживайте

### Edge функция

Вот теперь начинается самое интересное! Нужно создать публичную функцию, которая будет обновлять и возвращать количество просмотров. Переходим в раздел **functions** и нажимаем **Deploy a new function → Via Editor**

В открывшемся редакторе коде, пишем следующий код. Реализация довольно простая и понятная любому разработчику, безусловно здесь есть место для улучшения, но для обычного блога этого более чем достаточно

```ts
// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { Pool } from 'jsr:@db/postgres';

const pool = new Pool(Deno.env.get('SUPABASE_DB_URL')!, 3, true);

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS, POST',
    'Access-Control-Allow-Headers': 'x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    const { slug } = await req.json();

    if (!slug) {
      return new Response(JSON.stringify({ error: 'slug is required' }), {
	      status: 400,
	      headers: corsHeaders
	    });
    }

    const db = await pool.connect();

    try {
      const result = await db.queryObject<{ views: string }>(
        `
	        insert into views (slug, views)
	        values ($1, 1)
	        on conflict (slug)
	        do update
	        set views = views.views + 1
	        returning views::text as views
        `,
        [slug]
      );

      const [row] = result.rows;

      return new Response(JSON.stringify(row.views), {
        status: 200,
        headers: corsHeaders,
      });
    } finally {
      db.release();
    }
  } catch (e) {
	  const error = e instanceof Error ? e.message : 'Something went wrong';

    return new Response(JSON.stringify({ error }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
```

Ревью кода

- `corsHeaders` следует настроить по своему усмотрению, я бы посоветовал изменить `Origin` на адрес вашего сайта в остальном можно оставить без изменений
- Пару условий что бы корректно отрабатывать OPTIONS и отсекать лишние запросы
- Немного валидации, поле `slug` обязательно
- Подключение и **SQL** запрос **UPSERT** типа для создания или обновления и получения кол-ва просмотров
	- Здесь следует упомянуть то что кол-во просмотров приводится к строке из-за типа`BigInt` который мы указывали ранее при создании таблицы `int8`
- Далее у нас описано формирование ответа и обработка ошибки в `catch`

После написания кода в самом низу страницы в поле **Function name** пишем название нашей функции `views` и нажимаем **Deploy Function** после чего вы будете переадресованы на страницу настроек функции

В настройках функции находим параметр **Verify JWT with legacy secret** и выключаем его, нажимаем **Save changes**. Это нужно для публичного вызова функции всеми пользователями вашего сайта

В самом начале этой страницы можно заметить адрес нашей функции `https://hash.supabase.co/functions/v1/views` где `hash` будет случайно сгенерированный набор символов, переходим по этой ссылке, вы должны получить следующую ошибку `{"error":"Method not allowed"}` отлично, именно то что нам нужно! Это говорит о том что функция действительно работает и отсекает входящие **GET** запросы, потому что в коде мы явно указали отвечать только на **OPTIONS** и **POST**

На этом серверная часть закончена, если хотите вы можете поиграться с этим запросом через инструменты типа [Postman](https://www.postman.com/) или [Apidog](https://apidog.com/) например отправить **POST** запрос по адресу функции с телом запроса типа `{ "slug": "test" }` и после получения успешного ответа `"1"` можете перейти в **database → tables** и проверить что новая запись была успешно создана

### Astro компонент

Настало время добавить счетчик на ваш сайт! Здесь все еще проще чем можно подумать. Создаем новый **Astro** компонент под названием `views` и пишем в него следующий код

```jsx
---
import IconEyeIcon from "@/assets/icons/IconEye.svg";

type Props = {
  slug: string;
};

const { slug } = Astro.props;
---

<span class="inline-flex items-center gap-x-2 opacity-80">
  <IconEyeIcon />
  <span class="sr-only">Views</span>
  <span id="views">…</span>
</span>

<script define:vars={{ slug }} is:inline data-astro-rerun>
  (() => {
    if (!slug) return;

    const el = document.getElementById("views");

    if (!(el instanceof HTMLElement)) return;

    const endpoint = "https://hash.supabase.co/functions/v1/views";

    const render = value => {
      el.textContent = new Intl.NumberFormat().format(Number(value));
    };

    const fallback = () => {
      el.textContent = "…";
    };

    const load = async () => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ slug }),
          keepalive: true,
          credentials: "omit",
          cache: "no-store",
        });

        if (!res.ok) {
          fallback();
          return;
        }

        const value = await res.json();

        render(value);
      } catch {
        fallback();
      }
    };

    if ("requestIdleCallback" in window) {
      requestIdleCallback(load, {
        timeout: 1000,
      });
    } else {
      setTimeout(load, 0);
    }
  })();
</script>

```

Ревью кода

- Обязательно обращаем внимание на импорт иконки, сомневаюсь что она у вас есть, еще и с тем же именем и по тому же адресу! 99% здесь будет ошибка компиляции, меняем на свою иконку или вообще вырезаем использование иконки с строки **2** и **12**
- Чуть ниже объявлен пропс `slug` который будет передан из страницы в компонент
- Далее верстка, можете изменить на свой вкус
- Далее пару капель валидации, если отсутствует `slug` или не найден элемент с версткой дальнейший код не будет выполняться
- `endpoint` сюда обязательно вставьте адрес своей **Edge function**
- функции `render` и `fallback` отвечающие за обновление **DOM**
	- `render` в этой функции можно настроить форматирование по вашему вкусу
	- `fallback` в этой функции можно настроить отображение в случае ошибки
- функция `load` пожалуй самая главная здесь, именно она выполняет запрос и по итогу вызывает `render` или `fallback`
- в самом конце описан отложенный запуск функции `load` если браузер поддерживает `requestIdleCallback` то загрузка будет сразу после того как браузер освободился (но не более чем через 1 секунду), если браузер устарел то вызов будет сразу же после завершения текущего **call stack**

После создания компонента счетчика просмотров можно использовать его следующим образом, объявляем импорт компонента, добавляем его в вашу верстку и передаем в него `id` текущей страницы, готово!

```jsx
---
import Views from "@/components/Views.astro";
---

<Views slug={post.id} />
```

## Заключение

Вот и готов крутой счетчик просмотров, очень простой и пуленепробиваемый! Подобные вещи реализовать достаточно легко потому что не несут за собой сложной логики. Надеюсь моя реализация была полезна для вас и вы сделали себе счетчик просмотров

### Домашнее задание

Один и тот же пользователь при обновлении страницы будет накручивать счетчик просмотров бесконечно, что бы это исключить достаточно добавить [User Agent](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/User-Agent) (условный идентификатор браузера) в текущую реализацию.