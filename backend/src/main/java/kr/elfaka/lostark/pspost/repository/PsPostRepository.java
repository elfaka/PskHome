package kr.elfaka.lostark.pspost.repository;

import kr.elfaka.lostark.pspost.entity.PsPost;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface PsPostRepository extends JpaRepository<PsPost, Long> {
    Page<PsPost> findAllByOrderByCreatedAtDesc(Pageable pageable);
}