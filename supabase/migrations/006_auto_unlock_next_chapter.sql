-- Update trigger: when all lessons in a chapter are passed, unlock first lesson of next chapter
CREATE OR REPLACE FUNCTION public.unlock_next_lesson()
RETURNS TRIGGER AS $$
DECLARE
    v_chapter_id UUID;
    v_course_id UUID;
    v_next_lesson_id UUID;
    v_next_chapter_id UUID;
    v_next_chapter_first_lesson UUID;
    v_all_passed BOOLEAN;
BEGIN
    IF NEW.status = 'passed' AND OLD.status != 'passed' THEN
        -- Find the chapter and course
        SELECT l.chapter_id, ch.course_id INTO v_chapter_id, v_course_id
        FROM public.lessons l
        JOIN public.chapters ch ON l.chapter_id = ch.id
        WHERE l.id = NEW.lesson_id;

        -- Find next lesson in same chapter
        SELECT id INTO v_next_lesson_id
        FROM public.lessons
        WHERE chapter_id = v_chapter_id
          AND sort_order > (SELECT sort_order FROM public.lessons WHERE id = NEW.lesson_id)
        ORDER BY sort_order ASC LIMIT 1;

        IF v_next_lesson_id IS NOT NULL THEN
            INSERT INTO public.student_progress (student_id, lesson_id, status)
            VALUES (NEW.student_id, v_next_lesson_id, 'unlocked')
            ON CONFLICT (student_id, lesson_id) DO NOTHING;
        END IF;

        -- Check if all lessons in chapter are passed
        SELECT NOT EXISTS (
            SELECT 1 FROM public.lessons l
            LEFT JOIN public.student_progress sp
                ON l.id = sp.lesson_id AND sp.student_id = NEW.student_id
            WHERE l.chapter_id = v_chapter_id
              AND (sp.status IS NULL OR sp.status != 'passed')
        ) INTO v_all_passed;

        IF v_all_passed THEN
            -- Find next chapter in same course
            SELECT id INTO v_next_chapter_id
            FROM public.chapters
            WHERE course_id = v_course_id
              AND sort_order > (SELECT sort_order FROM public.chapters WHERE id = v_chapter_id)
            ORDER BY sort_order ASC LIMIT 1;

            -- Unlock first lesson of next chapter
            IF v_next_chapter_id IS NOT NULL THEN
                SELECT id INTO v_next_chapter_first_lesson
                FROM public.lessons
                WHERE chapter_id = v_next_chapter_id
                ORDER BY sort_order ASC LIMIT 1;

                IF v_next_chapter_first_lesson IS NOT NULL THEN
                    INSERT INTO public.student_progress (student_id, lesson_id, status)
                    VALUES (NEW.student_id, v_next_chapter_first_lesson, 'unlocked')
                    ON CONFLICT (student_id, lesson_id) DO NOTHING;
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
