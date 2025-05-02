package kr.elfaka.lostark.pspost.repository;

import kr.elfaka.lostark.pspost.entity.PsPost;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PsPostRepository extends JpaRepository<PsPost, Long> {
}